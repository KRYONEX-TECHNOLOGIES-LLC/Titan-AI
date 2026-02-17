// Performance Quantization Types
// packages/performance/quantization/src/types.ts

export type QuantizationType = 
  | 'f32'     // Full precision
  | 'f16'     // Half precision
  | 'bf16'    // Brain float 16
  | 'q8_0'    // 8-bit quantization
  | 'q5_1'    // 5-bit quantization with offset
  | 'q5_0'    // 5-bit quantization
  | 'q4_1'    // 4-bit quantization with offset
  | 'q4_0'    // 4-bit quantization
  | 'q3_k'    // 3-bit k-quant
  | 'q4_k'    // 4-bit k-quant
  | 'q5_k'    // 5-bit k-quant
  | 'q6_k'    // 6-bit k-quant
  | 'iq2_xxs' // 2-bit importance quantization
  | 'iq3_s'   // 3-bit importance quantization
  | 'iq4_nl'; // 4-bit non-linear importance quantization

export interface QuantizationConfig {
  targetType: QuantizationType;
  preserveLayers?: string[];
  calibrationData?: Float32Array[];
  threads?: number;
}

export interface QuantizationResult {
  originalSize: number;
  quantizedSize: number;
  compressionRatio: number;
  targetType: QuantizationType;
  duration: number;
  preservedLayers: string[];
}

export interface GGUFHeader {
  magic: number;
  version: number;
  tensorCount: bigint;
  metadataKVCount: bigint;
}

export interface GGUFMetadata {
  generalArchitecture?: string;
  generalName?: string;
  generalAuthor?: string;
  generalQuantizationVersion?: number;
  contextLength?: number;
  embeddingLength?: number;
  blockCount?: number;
  attentionHeadCount?: number;
  attentionLayerNormRMSEpsilon?: number;
  ropeFreqBase?: number;
  vocabSize?: number;
  [key: string]: unknown;
}

export interface GGUFTensor {
  name: string;
  dimensions: number[];
  type: QuantizationType;
  offset: bigint;
  size: number;
}

export interface GGUFFile {
  header: GGUFHeader;
  metadata: GGUFMetadata;
  tensors: GGUFTensor[];
  path: string;
  fileSize: number;
}

export interface ModelWeights {
  tensors: Map<string, TensorData>;
  dtype: QuantizationType;
  metadata: Record<string, unknown>;
}

export interface TensorData {
  data: ArrayBuffer;
  shape: number[];
  dtype: QuantizationType;
}
