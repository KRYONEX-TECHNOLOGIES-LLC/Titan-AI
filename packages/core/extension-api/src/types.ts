/**
 * Extension API types
 */

export interface ExtensionManifest {
  name: string;
  version: string;
  displayName: string;
  description: string;
  publisher: string;
  main: string;
  activationEvents: string[];
  contributes?: ExtensionContributions;
  dependencies?: Record<string, string>;
  engines: {
    titan: string;
    vscode?: string;
  };
}

export interface ExtensionContributions {
  commands?: CommandContribution[];
  configuration?: ConfigurationContribution;
  languages?: LanguageContribution[];
  grammars?: GrammarContribution[];
  themes?: ThemeContribution[];
  keybindings?: KeybindingContribution[];
  menus?: MenuContributions;
  views?: ViewContribution;
  aiProviders?: AIProviderContribution[];
  mcpServers?: MCPServerContribution[];
}

export interface CommandContribution {
  command: string;
  title: string;
  category?: string;
  icon?: string;
}

export interface ConfigurationContribution {
  title: string;
  properties: Record<string, ConfigurationProperty>;
}

export interface ConfigurationProperty {
  type: string;
  default?: unknown;
  description: string;
  enum?: unknown[];
  enumDescriptions?: string[];
}

export interface LanguageContribution {
  id: string;
  aliases: string[];
  extensions: string[];
  configuration?: string;
}

export interface GrammarContribution {
  language: string;
  scopeName: string;
  path: string;
}

export interface ThemeContribution {
  id: string;
  label: string;
  uiTheme: string;
  path: string;
}

export interface KeybindingContribution {
  command: string;
  key: string;
  mac?: string;
  when?: string;
}

export interface MenuContributions {
  'editor/context'?: MenuContribution[];
  'explorer/context'?: MenuContribution[];
  commandPalette?: MenuContribution[];
}

export interface MenuContribution {
  command: string;
  when?: string;
  group?: string;
}

export interface ViewContribution {
  containers?: ViewContainerContribution[];
  views?: Record<string, ViewItemContribution[]>;
}

export interface ViewContainerContribution {
  id: string;
  title: string;
  icon: string;
}

export interface ViewItemContribution {
  id: string;
  name: string;
  when?: string;
}

export interface AIProviderContribution {
  id: string;
  name: string;
  capabilities: string[];
}

export interface MCPServerContribution {
  id: string;
  name: string;
  command: string;
  args?: string[];
}

export interface ExtensionContext {
  extensionPath: string;
  extensionUri: string;
  globalState: Memento;
  workspaceState: Memento;
  secrets: SecretStorage;
  subscriptions: Disposable[];
}

export interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
}

export interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Disposable {
  dispose(): void;
}

export interface Extension<T = unknown> {
  id: string;
  extensionPath: string;
  isActive: boolean;
  packageJSON: ExtensionManifest;
  exports: T;
  activate(): Promise<T>;
}

export interface ExtensionAPI {
  activate(context: ExtensionContext): Promise<unknown>;
  deactivate?(): Promise<void>;
}
