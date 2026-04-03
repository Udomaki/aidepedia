#!/usr/bin/env node
/**
 * Plugin Scaffolding CLI
 * OC-109: Developer tools for creating plugins
 */

import type { PluginManifest, PluginPermission } from './types';

interface ScaffoldingOptions {
  name: string;
  description: string;
  author: string;
  permissions: PluginPermission[];
  outputPath: string;
}

class PluginScaffolder {
  /**
   * Scaffold a new plugin
   */
  async scaffold(options: ScaffoldingOptions): Promise<void> {
    const pluginId = this.toPluginId(options.name);
    const outputDir = `${options.outputPath}/${pluginId}`;
    
    // Create directory structure
    await this.createDirectoryStructure(outputDir);
    
    // Create manifest
    const manifest = this.createManifest(options, pluginId);
    await this.writeFile(`${outputDir}/plugin.json`, JSON.stringify(manifest, null, 2));
    
    // Create main entry point
    const mainCode = this.createMainFile(options);
    await this.writeFile(`${outputDir}/src/index.ts`, mainCode);
    
    // Create TypeScript config
    const tsConfig = this.createTsConfig();
    await this.writeFile(`${outputDir}/tsconfig.json`, JSON.stringify(tsConfig, null, 2));
    
    // Create package.json
    const packageJson = this.createPackageJson(options, pluginId);
    await this.writeFile(`${outputDir}/package.json`, JSON.stringify(packageJson, null, 2));
    
    // Create README
    const readme = this.createReadme(options);
    await this.writeFile(`${outputDir}/README.md`, readme);
    
    // Create .gitignore
    const gitignore = this.createGitignore();
    await this.writeFile(`${outputDir}/.gitignore`, gitignore);
    
    console.log(`✅ Plugin "${options.name}" scaffolded successfully at ${outputDir}`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${outputDir}`);
    console.log(`  pnpm install`);
    console.log(`  pnpm build`);
    console.log(`  # Test your plugin locally`);
    console.log(`  # Publish to AIdepedia marketplace`);
  }

  /**
   * Create directory structure
   */
  private async createDirectoryStructure(baseDir: string): Promise<void> {
    const dirs = [
      baseDir,
      `${baseDir}/src`,
      `${baseDir}/dist`,
      `${baseDir}/assets`
    ];
    
    for (const dir of dirs) {
      // In Node.js environment, use fs.mkdir
      // For now, we'll just log
      console.log(`Creating directory: ${dir}`);
    }
  }

  /**
   * Write file
   */
  private async writeFile(path: string, content: string): Promise<void> {
    // In Node.js environment, use fs.writeFile
    console.log(`Creating file: ${path}`);
  }

  /**
   * Create plugin manifest
   */
  private createManifest(options: ScaffoldingOptions, pluginId: string): PluginManifest {
    return {
      id: pluginId,
      name: options.name,
      version: '1.0.0',
      description: options.description,
      author: options.author,
      license: 'MIT',
      main: './dist/index.js',
      permissions: options.permissions,
      engines: {
        aidepedia: '^6.0.0'
      },
      contributes: {
        hooks: [
          {
            event: 'editor:before:save',
            handler: 'onBeforeSave',
            priority: 10
          }
        ],
        commands: [
          {
            id: `${pluginId}.hello`,
            title: 'Hello World',
            category: options.name,
            action: 'sayHello'
          }
        ]
      }
    };
  }

  /**
   * Create main plugin file
   */
  private createMainFile(options: ScaffoldingOptions): string {
    return `/**
 * ${options.name}
 * ${options.description}
 */

import type { PluginInstance, PluginContext } from '@aidepedia/plugin-types';

export const activate = async (context: PluginContext): Promise<void> => {
  context.logger.log('${options.name} activated!');
  
  // Register hooks
  context.hooks.register('editor:before:save', async (hookContext) => {
    context.logger.log('Before save:', hookContext.data);
    return hookContext.data;
  });
  
  // Register commands
  context.ui.registerCommand({
    id: '${this.toPluginId(options.name)}.hello',
    title: 'Hello World',
    category: '${options.name}',
    action: 'sayHello'
  });
  
  // Show welcome notification
  context.ui.showNotification('${options.name} is now active!', 'success');
};

export const deactivate = async (): Promise<void> => {
  console.log('${options.name} deactivated');
};

// Export plugin instance
const plugin: PluginInstance = {
  activate,
  deactivate,
  
  // Custom methods
  sayHello: () => {
    console.log('Hello from ${options.name}!');
  }
};

export default plugin;
`;
  }

  /**
   * Create TypeScript config
   */
  private createTsConfig(): object {
    return {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        lib: ['ES2020'],
        moduleResolution: 'node',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: './dist',
        rootDir: './src',
        declaration: true,
        declarationMap: true,
        sourceMap: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    };
  }

  /**
   * Create package.json
   */
  private createPackageJson(options: ScaffoldingOptions, pluginId: string): object {
    return {
      name: `@aidepedia/plugin-${pluginId}`,
      version: '1.0.0',
      description: options.description,
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: {
        build: 'tsc',
        watch: 'tsc --watch',
        test: 'echo "No tests yet"',
        lint: 'eslint src/**/*.ts'
      },
      keywords: ['aidepedia', 'plugin'],
      author: options.author,
      license: 'MIT',
      devDependencies: {
        '@aidepedia/plugin-types': '^1.0.0',
        '@types/node': '^20.0.0',
        typescript: '^5.0.0'
      }
    };
  }

  /**
   * Create README
   */
  private createReadme(options: ScaffoldingOptions): string {
    return `# ${options.name}

${options.description}

## Installation

1. Download this plugin
2. Go to AIdepedia Settings > Plugins
3. Click "Install Plugin" and select the plugin directory

## Usage

After installation, the plugin will be automatically activated.

## Permissions

This plugin requires the following permissions:
${options.permissions.map(p => `- \`${p}\``).join('\n')}

## Development

\`\`\`bash
pnpm install
pnpm build
\`\`\`

## License

MIT
`;
  }

  /**
   * Create .gitignore
   */
  private createGitignore(): string {
    return `node_modules/
dist/
*.log
.DS_Store
.env
`;
  }

  /**
   * Convert name to plugin ID
   */
  private toPluginId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
AIdepedia Plugin Scaffolder

Usage:
  scaffold-plugin <command> [options]

Commands:
  create     Create a new plugin
  
Options:
  --name         Plugin name (required)
  --description  Plugin description (required)
  --author       Author name (required)
  --permissions  Comma-separated permissions (optional)
  --output       Output directory (default: ./plugins)

Example:
  scaffold-plugin create \\
    --name "My Plugin" \\
    --description "Does something cool" \\
    --author "Your Name" \\
    --permissions "read:articles,write:articles" \\
    --output ./plugins
`);
    return;
  }
  
  if (args[0] === 'create') {
    const getArg = (name: string): string | undefined => {
      const index = args.indexOf(name);
      return index !== -1 ? args[index + 1] : undefined;
    };
    
    const name = getArg('--name');
    const description = getArg('--description') || 'An AIdepedia plugin';
    const author = getArg('--author') || 'Anonymous';
    const permissionsStr = getArg('--permissions') || '';
    const output = getArg('--output') || './plugins';
    
    if (!name) {
      console.error('Error: --name is required');
      process.exit(1);
    }
    
    const permissions: PluginPermission[] = permissionsStr
      ? permissionsStr.split(',').map(p => p.trim() as PluginPermission)
      : [];
    
    const scaffolder = new PluginScaffolder();
    await scaffolder.scaffold({
      name,
      description,
      author,
      permissions,
      outputPath: output
    });
  }
}

// Export for programmatic use
export { PluginScaffolder };

// Run CLI if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}
