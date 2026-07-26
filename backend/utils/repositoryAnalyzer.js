/**
 * Context-Aware Repository Analysis Engine
 * Extracts metadata, frameworks, dependencies, and architecture from the repository files.
 */

export function buildRepositoryContext(files) {
  const context = {
    frameworks: new Set(),
    dependencies: {},
    devDependencies: {},
    codingStyles: [],
    configs: [],
    architecture: {
      hasFrontend: false,
      hasBackend: false,
      hasDatabase: false,
      directories: new Set()
    }
  };

  files.forEach(file => {
    const fileName = file.name;
    const content = file.content;
    const lowerName = fileName.toLowerCase();

    // Extract directories
    const parts = fileName.split('/');
    if (parts.length > 1) {
      context.architecture.directories.add(parts[0]);
    }

    // 1. Dependency Graph & Framework Detection
    if (lowerName.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(content);
        if (pkg.dependencies) {
          Object.assign(context.dependencies, pkg.dependencies);
          detectFrameworksFromDeps(pkg.dependencies, context);
        }
        if (pkg.devDependencies) {
          Object.assign(context.devDependencies, pkg.devDependencies);
          detectFrameworksFromDeps(pkg.devDependencies, context);
        }
      } catch (e) {
        // invalid json, ignore
      }
    } else if (lowerName.endsWith('requirements.txt')) {
      const lines = content.split('\n');
      lines.forEach(line => {
        const dep = line.split('==')[0].trim();
        if (dep) {
          context.dependencies[dep] = 'latest';
          detectFrameworksFromDeps({ [dep]: 'latest' }, context);
        }
      });
    }

    // 2. Coding Style Discovery
    if (lowerName.endsWith('.prettierrc') || lowerName.endsWith('.prettierrc.json')) {
      context.codingStyles.push('Prettier Configuration Found');
    } else if (lowerName.includes('.eslintrc')) {
      context.codingStyles.push('ESLint Configuration Found');
    } else if (lowerName.endsWith('.editorconfig')) {
      context.codingStyles.push('EditorConfig Found');
    }

    // 3. Configuration File Parser
    if (lowerName.endsWith('docker-compose.yml') || lowerName.endsWith('docker-compose.yaml')) {
      context.configs.push('Docker Compose Setup');
    } else if (lowerName.endsWith('tsconfig.json')) {
      context.configs.push('TypeScript Configuration');
    } else if (lowerName.endsWith('jest.config.js')) {
      context.configs.push('Jest Testing Framework');
    }

    // 4. Architecture Summary Generation
    if (lowerName.includes('/src/components') || lowerName.includes('/src/pages') || lowerName.endsWith('.jsx') || lowerName.endsWith('.tsx')) {
      context.architecture.hasFrontend = true;
    }
    if (lowerName.includes('/controllers') || lowerName.includes('/routes') || lowerName.includes('server.js') || lowerName.includes('app.py') || lowerName.includes('main.go')) {
      context.architecture.hasBackend = true;
    }
    if (lowerName.includes('schema.prisma') || lowerName.includes('mongoose') || lowerName.includes('typeorm') || lowerName.includes('/models/')) {
      context.architecture.hasDatabase = true;
    }
  });

  // Convert Sets to Arrays for serialization
  return {
    frameworks: Array.from(context.frameworks),
    dependencies: context.dependencies,
    devDependencies: context.devDependencies,
    codingStyles: context.codingStyles,
    configs: context.configs,
    architecture: {
      hasFrontend: context.architecture.hasFrontend,
      hasBackend: context.architecture.hasBackend,
      hasDatabase: context.architecture.hasDatabase,
      rootDirectories: Array.from(context.architecture.directories)
    }
  };
}

function detectFrameworksFromDeps(deps, context) {
  const fwMap = {
    'react': 'React',
    'next': 'Next.js',
    'vue': 'Vue.js',
    'nuxt': 'Nuxt.js',
    'angular': 'Angular',
    'express': 'Express.js',
    'fastapi': 'FastAPI',
    'django': 'Django',
    'flask': 'Flask',
    'tailwindcss': 'Tailwind CSS',
    'mongoose': 'Mongoose (MongoDB)',
    'prisma': 'Prisma ORM',
    'jest': 'Jest',
    'typescript': 'TypeScript'
  };

  for (const dep of Object.keys(deps)) {
    const normalizedDep = dep.toLowerCase();
    if (fwMap[normalizedDep]) {
      context.frameworks.add(fwMap[normalizedDep]);
    }
  }
}
