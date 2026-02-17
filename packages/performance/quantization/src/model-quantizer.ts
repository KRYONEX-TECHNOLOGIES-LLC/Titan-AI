// Model Quantizer
// packages/performance/quantization/src/model-quantizer.ts

import { EventEmitter } from 'events';
import {
  QuantizationType,
  QuantizationConfig,
  QuantizationResult,
  ModelWeights,
  TensorData,
} from './types';

export class ModelQuantizer extends EventEmitter {
  private config: QuantizationConfig;

  constructor(config: QuantizationConfig) {
    super();
    this.config = {
      threads: 4,
      preserveLayers: [],
      ...config,
    };
  }

  async quantize(weights: ModelWeights): Promise<ModelWeights> {
    const startTime = Date.now();
    const originalSize = this.calculateSize(weights);
    const quantizedTensors = new Map<string, TensorData>();

    let processed = 0;
    const total = weights.tensors.size;

    for (const [name, tensor] of weights.tensors) {
      const shouldPreserve = this.config.preserveLayers?.some(
        pattern => name.includes(pattern)
      );

      if (shouldPreserve) {
        // Keep original precision for critical layers
        quantizedTensors.set(name, tensor);
      } else {
        const quantized = await this.quantizeTensor(tensor);
        quantizedTensors.set(name, quantized);
      }

      processed++;
      this.emit('progress', { processed, total, name });
    }

    const quantizedWeights: ModelWeights = {
      tensors: quantizedTensors,
      dtype: this.config.targetType,
      metadata: {
        ...weights.metadata,
        quantization: {
          originalDtype: weights.dtype,
          targetDtype: this.config.targetType,
          preservedLayers: this.config.preserveLayers,
        },
      },
    };

    const quantizedSize = this.calculateSize(quantizedWeights);

    const result: QuantizationResult = {
      originalSize,
      quantizedSize,
      compressionRatio: originalSize / quantizedSize,
      targetType: this.config.targetType,
      duration: Date.now() - startTime,
      preservedLayers: this.config.preserveLayers || [],
    };

    this.emit('complete', result);
    return quantizedWeights;
  }

  private async quantizeTensor(tensor: TensorData): Promise<TensorData> {
    const sourceData = new Float32Array(tensor.data);
    let quantizedData: ArrayBuffer;

    switch (this.config.targetType) {
      case 'f16':
        quantizedData = this.quantizeF16(sourceData);
        break;
      case 'q8_0':
        quantizedData = this.quantizeQ8_0(sourceData);
        break;
      case 'q4_0':
        quantizedData = this.quantizeQ4_0(sourceData);
        break;
      case 'q4_k':
        quantizedData = this.quantizeQ4_K(sourceData);
        break;
      default:
        quantizedData = this.quantizeQ8_0(sourceData);
    }

    return {
      data: quantizedData,
      shape: tensor.shape,
      dtype: this.config.targetType,
    };
  }

  private quantizeF16(data: Float32Array): ArrayBuffer {
    const f16 = new Uint16Array(data.length);

    for (let i = 0; i < data.length; i++) {
      f16[i] = this.floatToHalf(data[i]);
    }

    return f16.buffer;
  }

  private floatToHalf(value: number): number {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value);
    const bits = view.getUint32(0);

    const sign = (bits >>> 31) << 15;
    let exponent = (bits >>> 23) & 0xFF;
    let mantissa = bits & 0x7FFFFF;

    if (exponent === 0xFF) {
      // Inf or NaN
      return sign | 0x7C00 | (mantissa ? 0x200 : 0);
    }

    if (exponent === 0) {
      // Zero or denormal
      return sign;
    }

    exponent = exponent - 127 + 15;

    if (exponent >= 0x1F) {
      // Overflow to Inf
      return sign | 0x7C00;
    }

    if (exponent <= 0) {
      // Underflow to zero
      return sign;
    }

    return sign | (exponent << 10) | (mantissa >>> 13);
  }

  private quantizeQ8_0(data: Float32Array): ArrayBuffer {
    const blockSize = 32;
    const numBlocks = Math.ceil(data.length / blockSize);
    
    // Each block: 1 f16 scale + 32 int8 values = 34 bytes
    const output = new Uint8Array(numBlocks * 34);
    const view = new DataView(output.buffer);

    for (let block = 0; block < numBlocks; block++) {
      const start = block * blockSize;
      const end = Math.min(start + blockSize, data.length);
      
      // Find max absolute value for scale
      let maxAbs = 0;
      for (let i = start; i < end; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(data[i]));
      }
      
      const scale = maxAbs / 127;
      const invScale = scale > 0 ? 1 / scale : 0;

      // Store scale as f16
      const blockOffset = block * 34;
      view.setUint16(blockOffset, this.floatToHalf(scale), true);

      // Quantize values
      for (let i = 0; i < blockSize; i++) {
        const idx = start + i;
        const value = idx < data.length ? data[idx] : 0;
        const quantized = Math.round(value * invScale);
        output[blockOffset + 2 + i] = Math.max(-128, Math.min(127, quantized)) + 128;
      }
    }

    return output.buffer;
  }

  private quantizeQ4_0(data: Float32Array): ArrayBuffer {
    const blockSize = 32;
    const numBlocks = Math.ceil(data.length / blockSize);
    
    // Each block: 1 f16 scale + 16 bytes (32 4-bit values) = 18 bytes
    const output = new Uint8Array(numBlocks * 18);
    const view = new DataView(output.buffer);

    for (let block = 0; block < numBlocks; block++) {
      const start = block * blockSize;
      const end = Math.min(start + blockSize, data.length);
      
      // Find max absolute value for scale
      let maxAbs = 0;
      for (let i = start; i < end; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(data[i]));
      }
      
      const scale = maxAbs / 7; // 4-bit signed: -8 to 7
      const invScale = scale > 0 ? 1 / scale : 0;

      const blockOffset = block * 18;
      view.setUint16(blockOffset, this.floatToHalf(scale), true);

      // Pack two 4-bit values per byte
      for (let i = 0; i < 16; i++) {
        const idx1 = start + i * 2;
        const idx2 = start + i * 2 + 1;
        
        const v1 = idx1 < data.length ? data[idx1] : 0;
        const v2 = idx2 < data.length ? data[idx2] : 0;
        
        const q1 = Math.max(-8, Math.min(7, Math.round(v1 * invScale))) + 8;
        const q2 = Math.max(-8, Math.min(7, Math.round(v2 * invScale))) + 8;
        
        output[blockOffset + 2 + i] = (q1 & 0xF) | ((q2 & 0xF) << 4);
      }
    }

    return output.buffer;
  }

  private quantizeQ4_K(data: Float32Array): ArrayBuffer {
    // K-quant uses super-blocks with multiple sub-blocks
    // This is a simplified implementation
    return this.quantizeQ4_0(data);
  }

  private calculateSize(weights: ModelWeights): number {
    let size = 0;
    for (const tensor of weights.tensors.values()) {
      size += tensor.data.byteLength;
    }
    return size;
  }

  static getCompressionRatio(source: QuantizationType, target: QuantizationType): number {
    const sizes: Record<QuantizationType, number> = {
      f32: 32,
      f16: 16,
      bf16: 16,
      q8_0: 8.5, // Includes scale overhead
      q5_1: 5.5,
      q5_0: 5.5,
      q4_1: 4.5,
      q4_0: 4.5,
      q3_k: 3.5,
      q4_k: 4.5,
      q5_k: 5.5,
      q6_k: 6.5,
      iq2_xxs: 2.5,
      iq3_s: 3.5,
      iq4_nl: 4.5,
    };

    return sizes[source] / sizes[target];
  }
}
