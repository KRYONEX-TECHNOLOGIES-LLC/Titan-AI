// Conflict Detector
// packages/shadow/branching/src/conflict-detector.ts

import * as fs from 'fs/promises';
import {
  ConflictedFile,
  ConflictType,
  ConflictMarker,
  ConflictResolution,
} from './types';

export class ConflictDetector {
  async detectConflicts(filePath: string): Promise<ConflictedFile | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      if (!this.hasConflictMarkers(content)) {
        return null;
      }

      const markers = this.parseConflictMarkers(content);
      const { ourVersion, theirVersion, baseVersion } = this.extractVersions(content);

      return {
        path: filePath,
        conflictType: 'content',
        ourVersion,
        theirVersion,
        baseVersion,
        markers,
      };
    } catch {
      return null;
    }
  }

  async detectAllConflicts(directory: string): Promise<ConflictedFile[]> {
    const conflicts: ConflictedFile[] = [];
    const files = await this.findConflictedFiles(directory);

    for (const file of files) {
      const conflict = await this.detectConflicts(file);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  private hasConflictMarkers(content: string): boolean {
    return content.includes('<<<<<<<') && 
           content.includes('=======') && 
           content.includes('>>>>>>>');
  }

  private parseConflictMarkers(content: string): ConflictMarker[] {
    const markers: ConflictMarker[] = [];
    const lines = content.split('\n');

    let currentSection: ConflictMarker | null = null;
    let inConflict = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        currentSection = {
          startLine: i + 1,
          endLine: i + 1,
          section: 'ours',
        };
      } else if (line.startsWith('|||||||') && inConflict) {
        if (currentSection) {
          currentSection.endLine = i;
          markers.push(currentSection);
        }
        currentSection = {
          startLine: i + 1,
          endLine: i + 1,
          section: 'base',
        };
      } else if (line.startsWith('=======') && inConflict) {
        if (currentSection) {
          currentSection.endLine = i;
          markers.push(currentSection);
        }
        currentSection = {
          startLine: i + 1,
          endLine: i + 1,
          section: 'theirs',
        };
      } else if (line.startsWith('>>>>>>>') && inConflict) {
        if (currentSection) {
          currentSection.endLine = i;
          markers.push(currentSection);
        }
        inConflict = false;
        currentSection = null;
      }
    }

    return markers;
  }

  private extractVersions(content: string): {
    ourVersion: string;
    theirVersion: string;
    baseVersion?: string;
  } {
    const sections: { ours: string[]; theirs: string[]; base: string[] } = {
      ours: [],
      theirs: [],
      base: [],
    };

    const lines = content.split('\n');
    let currentSection: 'ours' | 'theirs' | 'base' | null = null;

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        currentSection = 'ours';
      } else if (line.startsWith('|||||||')) {
        currentSection = 'base';
      } else if (line.startsWith('=======')) {
        currentSection = 'theirs';
      } else if (line.startsWith('>>>>>>>')) {
        currentSection = null;
      } else if (currentSection) {
        sections[currentSection].push(line);
      }
    }

    return {
      ourVersion: sections.ours.join('\n'),
      theirVersion: sections.theirs.join('\n'),
      baseVersion: sections.base.length > 0 ? sections.base.join('\n') : undefined,
    };
  }

  async resolveConflict(
    filePath: string,
    resolution: ConflictResolution
  ): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    let resolved: string;

    switch (resolution.strategy) {
      case 'ours':
        resolved = this.resolveWithOurs(content);
        break;
      case 'theirs':
        resolved = this.resolveWithTheirs(content);
        break;
      case 'manual':
        if (!resolution.resolvedContent) {
          throw new Error('Manual resolution requires resolvedContent');
        }
        resolved = resolution.resolvedContent;
        break;
      case 'merge':
        resolved = this.attemptAutoMerge(content);
        break;
      default:
        throw new Error(`Unknown resolution strategy: ${resolution.strategy}`);
    }

    await fs.writeFile(filePath, resolved);
  }

  private resolveWithOurs(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inConflict = false;
    let keepLines = false;

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        keepLines = true;
      } else if (line.startsWith('|||||||') || line.startsWith('=======')) {
        keepLines = false;
      } else if (line.startsWith('>>>>>>>')) {
        inConflict = false;
        keepLines = false;
      } else if (!inConflict || keepLines) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  private resolveWithTheirs(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inConflict = false;
    let keepLines = false;

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        keepLines = false;
      } else if (line.startsWith('=======')) {
        keepLines = true;
      } else if (line.startsWith('>>>>>>>')) {
        inConflict = false;
        keepLines = false;
      } else if (!inConflict || keepLines) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  private attemptAutoMerge(content: string): string {
    // Simple line-based merge: include unique lines from both sides
    const { ourVersion, theirVersion } = this.extractVersions(content);
    const ourLines = new Set(ourVersion.split('\n'));
    const theirLines = new Set(theirVersion.split('\n'));

    const merged = new Set([...ourLines, ...theirLines]);
    
    // Replace conflict sections with merged content
    const lines = content.split('\n');
    const result: string[] = [];
    let inConflict = false;
    let conflictResolved = false;

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        conflictResolved = false;
      } else if (line.startsWith('>>>>>>>')) {
        if (!conflictResolved) {
          result.push(...merged);
          conflictResolved = true;
        }
        inConflict = false;
      } else if (!inConflict) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  private async findConflictedFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    
    async function scan(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = `${dir}/${entry.name}`;
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }

    await scan(directory);
    return files;
  }
}
