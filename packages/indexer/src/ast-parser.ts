import ts from 'typescript';
import { RelationshipTracker } from './types';

export class ASTParser {
  private readonly tracker: RelationshipTracker;

  constructor(tracker: RelationshipTracker) {
    this.tracker = tracker;
  }

  parseFile(path: string, source: string): void {
    const ast = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true
    );

    this.tracker.startFile(path);
    ts.forEachChild(ast, (node) => this.visitNode(node, path));
  }

  private visitNode(node: ts.Node, parentPath: string): void {
    if (ts.isImportDeclaration(node)) {
      this.processImport(node, parentPath);
    } else if (ts.isExportDeclaration(node)) {
      this.processExport(node, parentPath);
    } else if (ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) {
      this.processDefinition(node, parentPath);
    }

    ts.forEachChild(node, (child) => this.visitNode(child, parentPath));
  }

  private processImport(node: ts.ImportDeclaration, importer: string) {
    const specifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
    this.tracker.addDependency(importer, specifier);
  }

  private processExport(node: ts.ExportDeclaration, exporter: string) {
    const specifier = node.moduleSpecifier?.getText().replace(/['"]/g, '');
    if (specifier) {
      this.tracker.addDependency(exporter, specifier);
    }
  }

  private processDefinition(
    node: ts.ClassDeclaration | ts.FunctionDeclaration,
    filePath: string
  ) {
    const name = node.name?.getText() || 'anonymous';
    const type = ts.isClassDeclaration(node) ? 'class' : 'function';
    this.tracker.addDefinition(filePath, name, type, node.getStart());
  }
}
