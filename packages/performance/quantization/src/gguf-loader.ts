// GGUF File Loader
// packages/performance/quantization/src/gguf-loader.ts

import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import {
  GGUFHeader,
  GGUFMetadata,
  GGUFTensor,
  GGUFFile,
  QuantizationType,
} from './types';

// GGUF Magic number
const GGUF_MAGIC = 0x46554747; // "GGUF" in little-endian

// GGUF Value types
enum GGUFValueType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

export class GGUFLoader extends EventEmitter {
  private buffer: ArrayBuffer | null = null;
  private view: DataView | null = null;
  private offset: number = 0;

  async load(filePath: string): Promise<GGUFFile> {
    this.emit('load:start', { path: filePath });

    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    const fileHandle = await fs.open(filePath, 'r');
    
    try {
      // Read header first (enough for initial parsing)
      const headerBuffer = Buffer.alloc(Math.min(1024 * 1024, fileSize)); // 1MB or file size
      await fileHandle.read(headerBuffer, 0, headerBuffer.length, 0);

      this.buffer = headerBuffer.buffer.slice(
        headerBuffer.byteOffset,
        headerBuffer.byteOffset + headerBuffer.length
      );
      this.view = new DataView(this.buffer);
      this.offset = 0;

      // Parse header
      const header = this.parseHeader();
      this.emit('header:parsed', header);

      // Parse metadata
      const metadata = await this.parseMetadata(Number(header.metadataKVCount));
      this.emit('metadata:parsed', metadata);

      // Parse tensor info (not loading actual tensor data)
      const tensors = await this.parseTensorInfo(Number(header.tensorCount));
      this.emit('tensors:parsed', { count: tensors.length });

      const ggufFile: GGUFFile = {
        header,
        metadata,
        tensors,
        path: filePath,
        fileSize,
      };

      this.emit('load:complete', ggufFile);
      return ggufFile;
    } finally {
      await fileHandle.close();
      this.buffer = null;
      this.view = null;
    }
  }

  private parseHeader(): GGUFHeader {
    if (!this.view) throw new Error('No buffer loaded');

    const magic = this.view.getUint32(this.offset, true);
    this.offset += 4;

    if (magic !== GGUF_MAGIC) {
      throw new Error(`Invalid GGUF file: magic number mismatch (got ${magic.toString(16)})`);
    }

    const version = this.view.getUint32(this.offset, true);
    this.offset += 4;

    if (version < 2 || version > 3) {
      throw new Error(`Unsupported GGUF version: ${version}`);
    }

    const tensorCount = this.view.getBigUint64(this.offset, true);
    this.offset += 8;

    const metadataKVCount = this.view.getBigUint64(this.offset, true);
    this.offset += 8;

    return {
      magic,
      version,
      tensorCount,
      metadataKVCount,
    };
  }

  private async parseMetadata(count: number): Promise<GGUFMetadata> {
    const metadata: GGUFMetadata = {};

    for (let i = 0; i < count; i++) {
      const key = this.readString();
      const value = this.readValue();
      
      // Convert key to camelCase
      const camelKey = key.replace(/[._](\w)/g, (_, c) => c.toUpperCase());
      metadata[camelKey] = value;

      this.emit('metadata:entry', { key, value, index: i, total: count });
    }

    return metadata;
  }

  private async parseTensorInfo(count: number): Promise<GGUFTensor[]> {
    const tensors: GGUFTensor[] = [];

    for (let i = 0; i < count; i++) {
      const name = this.readString();
      
      // Number of dimensions
      const nDims = this.view!.getUint32(this.offset, true);
      this.offset += 4;

      // Dimensions
      const dimensions: number[] = [];
      for (let d = 0; d < nDims; d++) {
        dimensions.push(Number(this.view!.getBigUint64(this.offset, true)));
        this.offset += 8;
      }

      // Tensor type
      const typeId = this.view!.getUint32(this.offset, true);
      this.offset += 4;
      const type = this.tensorTypeToString(typeId);

      // Offset in file
      const offset = this.view!.getBigUint64(this.offset, true);
      this.offset += 8;

      // Calculate size
      const size = this.calculateTensorSize(dimensions, type);

      tensors.push({
        name,
        dimensions,
        type,
        offset,
        size,
      });
    }

    return tensors;
  }

  private readString(): string {
    if (!this.view) throw new Error('No buffer loaded');

    const length = Number(this.view.getBigUint64(this.offset, true));
    this.offset += 8;

    const bytes = new Uint8Array(this.buffer!, this.offset, length);
    this.offset += length;

    return new TextDecoder().decode(bytes);
  }

  private readValue(): unknown {
    if (!this.view) throw new Error('No buffer loaded');

    const type = this.view.getUint32(this.offset, true);
    this.offset += 4;

    switch (type) {
      case GGUFValueType.UINT8:
        const u8 = this.view.getUint8(this.offset);
        this.offset += 1;
        return u8;

      case GGUFValueType.INT8:
        const i8 = this.view.getInt8(this.offset);
        this.offset += 1;
        return i8;

      case GGUFValueType.UINT16:
        const u16 = this.view.getUint16(this.offset, true);
        this.offset += 2;
        return u16;

      case GGUFValueType.INT16:
        const i16 = this.view.getInt16(this.offset, true);
        this.offset += 2;
        return i16;

      case GGUFValueType.UINT32:
        const u32 = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return u32;

      case GGUFValueType.INT32:
        const i32 = this.view.getInt32(this.offset, true);
        this.offset += 4;
        return i32;

      case GGUFValueType.FLOAT32:
        const f32 = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return f32;

      case GGUFValueType.BOOL:
        const bool = this.view.getUint8(this.offset) !== 0;
        this.offset += 1;
        return bool;

      case GGUFValueType.STRING:
        return this.readString();

      case GGUFValueType.ARRAY:
        const arrayType = this.view.getUint32(this.offset, true);
        this.offset += 4;
        const arrayLength = Number(this.view.getBigUint64(this.offset, true));
        this.offset += 8;
        
        const array: unknown[] = [];
        for (let i = 0; i < arrayLength; i++) {
          // For arrays, the type is already known
          this.offset -= 4; // Rewind to re-read with correct type
          this.view.setUint32(this.offset, arrayType, true);
          array.push(this.readValue());
        }
        return array;

      case GGUFValueType.UINT64:
        const u64 = this.view.getBigUint64(this.offset, true);
        this.offset += 8;
        return u64;

      case GGUFValueType.INT64:
        const i64 = this.view.getBigInt64(this.offset, true);
        this.offset += 8;
        return i64;

      case GGUFValueType.FLOAT64:
        const f64 = this.view.getFloat64(this.offset, true);
        this.offset += 8;
        return f64;

      default:
        throw new Error(`Unknown GGUF value type: ${type}`);
    }
  }

  private tensorTypeToString(typeId: number): QuantizationType {
    const types: Record<number, QuantizationType> = {
      0: 'f32',
      1: 'f16',
      2: 'q4_0',
      3: 'q4_1',
      6: 'q5_0',
      7: 'q5_1',
      8: 'q8_0',
      10: 'q3_k',
      11: 'q4_k',
      12: 'q5_k',
      13: 'q6_k',
      16: 'iq2_xxs',
      17: 'iq3_s',
      20: 'iq4_nl',
      30: 'bf16',
    };

    return types[typeId] || 'f32';
  }

  private calculateTensorSize(dimensions: number[], type: QuantizationType): number {
    const elements = dimensions.reduce((a, b) => a * b, 1);
    
    const bitsPerElement: Record<QuantizationType, number> = {
      f32: 32,
      f16: 16,
      bf16: 16,
      q8_0: 8.5,
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

    return Math.ceil(elements * bitsPerElement[type] / 8);
  }

  static getModelInfo(ggufFile: GGUFFile): ModelInfo {
    return {
      name: ggufFile.metadata.generalName as string || 'Unknown',
      architecture: ggufFile.metadata.generalArchitecture as string || 'Unknown',
      author: ggufFile.metadata.generalAuthor as string,
      quantization: ggufFile.tensors[0]?.type || 'f32',
      contextLength: ggufFile.metadata.contextLength as number,
      embeddingLength: ggufFile.metadata.embeddingLength as number,
      vocabSize: ggufFile.metadata.vocabSize as number,
      tensorCount: ggufFile.tensors.length,
      fileSize: ggufFile.fileSize,
      fileSizeHuman: formatBytes(ggufFile.fileSize),
    };
  }
}

export interface ModelInfo {
  name: string;
  architecture: string;
  author?: string;
  quantization: QuantizationType;
  contextLength?: number;
  embeddingLength?: number;
  vocabSize?: number;
  tensorCount: number;
  fileSize: number;
  fileSizeHuman: string;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  
  return `${size.toFixed(2)} ${units[i]}`;
}
