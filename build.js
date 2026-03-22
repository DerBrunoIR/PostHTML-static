const { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync, existsSync } = require('fs')
const path = require('path')

const posthtml = require('posthtml')
const { parser } = require('posthtml-parser')

/**
 * Applies template parameters to content.
 * Supports {{ variable }} syntax.
 * @param {string} content - Template content
 * @param {object} locals - Key-value pairs
 * @returns {string} Interpolated content
 */
function applyLocals(content, locals) {
  if (!locals || typeof locals !== 'object') return content
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return locals[key] !== undefined ? String(locals[key]) : match
  })
}

/**
 * Custom include plugin that properly resolves paths relative to the including file.
 * Supports parameters via `locals` attribute with {{ variable }} syntax.
 * @param {object} options - Plugin options
 * @param {string} options.encoding - File encoding (default: 'utf-8')
 * @param {string} options.root - Root directory for absolute includes
 * @returns {function} PostHTML plugin
 */
function includePlugin(options = {}) {
  const encoding = options.encoding || 'utf-8'
  const root = options.root ? path.resolve(options.root) : process.cwd()

  /**
   * Recursively processes include tags in a tree.
   * @param {Array} tree - PostHTML tree (array of nodes)
   * @param {string|null} currentFile - Path of the file being processed
   * @returns {Array} Processed tree with included content merged
   */
  function processIncludes(tree, currentFile) {
    // Compute cwd from current file
    const cwd = currentFile ? path.dirname(currentFile) : root
    const result = []

    for (const node of tree) {
      // Handle text nodes (strings) - don't spread them
      if (typeof node === 'string') {
        result.push(node)
        continue
      }

      if (node.tag === 'include' && node.attrs && node.attrs.src) {
        // Resolve include path:
        // - Absolute paths (starting with /) are relative to project root
        // - Relative paths are relative to including file's directory
        const resolvedPath = node.attrs.src.startsWith('/')
          ? path.resolve(root, node.attrs.src.slice(1))
          : path.resolve(cwd, node.attrs.src)

        // Read the file content
        let content = readFileSync(resolvedPath, encoding)

        // Apply parameters if provided (from tag content)
        // Content between include tags can be JSON: <include src="...">{ "key": "value" }</include>
        if (node.content && Array.isArray(node.content)) {
          const contentStr = node.content.join('').trim()
          if (contentStr) {
            try {
              const locals = JSON.parse(contentStr)
              content = applyLocals(content, locals)
            } catch (e) {
              // Invalid JSON, skip parameter substitution
            }
          }
        }

        // Parse and recursively process nested includes
        const subtree = parser(content)
        const processed = processIncludes(subtree, resolvedPath)

        // Directly add processed nodes to result (splice)
        result.push(...processed)
      } else {
        // Clone node and recurse into content
        const cloned = { ...node }
        if (cloned.content && Array.isArray(cloned.content)) {
          cloned.content = processIncludes(cloned.content, currentFile)
        }
        result.push(cloned)
      }
    }

    return result
  }

  return function includeTransform(tree) {
    const processed = processIncludes(tree, tree.options && tree.options.from)
    // Replace tree content with processed result
    tree.length = 0
    tree.push(...processed)
    return tree
  }
}

const SRC_DIR = path.join(__dirname, 'src')
const DIST_DIR = path.join(__dirname, 'dist')
const BUILD_DIR = path.join(__dirname, 'build')

/**
 * Recursively finds all HTML files in a directory.
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of absolute file paths
 */
function findHtmlFiles(dir) {
  const files = []
  const entries = readdirSync(dir)
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    
    if (stat.isDirectory()) {
      files.push(...findHtmlFiles(fullPath))
    } else if (entry.endsWith('.html')) {
      files.push(fullPath)
    }
  }
  
  return files
}

/**
 * Extracts include targets from HTML content using AST traversal.
 * @param {string} content - HTML content
 * @param {string} basePath - Base path for resolving relative includes
 * @param {string} root - Project root for absolute paths
 * @returns {string[]} Array of absolute include paths
 */
function extractIncludes(content, basePath, root) {
  const tree = parser(content)
  const includes = []

  function walk(node) {
    if (node.tag === 'include' && node.attrs && node.attrs.src) {
      // Same path resolution as includePlugin
      const resolvedPath = node.attrs.src.startsWith('/')
        ? path.resolve(root, node.attrs.src.slice(1))
        : path.resolve(basePath, node.attrs.src)
      includes.push(resolvedPath)
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(walk)
    }
  }

  tree.forEach(walk)
  return includes
}

/**
 * Builds the dependency graph from HTML files.
 * @param {string[]} files - Array of HTML file paths
 * @returns {Map<string, string[]>} Map of file path to its dependencies
 */
function buildDependencyGraph(files) {
  const graph = new Map()
  
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const dir = path.dirname(file)
    const deps = extractIncludes(content, dir, SRC_DIR)
    graph.set(file, deps)
  }
  
  return graph
}

/**
 * Performs topological sort using Kahn's algorithm.
 * @param {Map<string, string[]>} graph - Dependency graph
 * @returns {{ order: string[], cycle: string[] | null }} Sorted order or detected cycle
 */
function topologicalSort(graph) {
  // Calculate in-degrees
  const inDegree = new Map()
  const allNodes = new Set(graph.keys())
  
  // Initialize in-degrees
  for (const node of allNodes) {
    inDegree.set(node, 0)
  }
  
  // Build reverse graph and calculate in-degrees
  const dependents = new Map()
  for (const node of allNodes) {
    dependents.set(node, [])
  }
  
  for (const [node, deps] of graph) {
    for (const dep of deps) {
      if (allNodes.has(dep)) {
        inDegree.set(node, inDegree.get(node) + 1)
        dependents.get(dep).push(node)
      }
    }
  }
  
  // Start with nodes that have no dependencies
  const queue = []
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node)
    }
  }
  
  const sorted = []
  
  while (queue.length > 0) {
    const node = queue.shift()
    sorted.push(node)
    
    for (const dependent of dependents.get(node)) {
      inDegree.set(dependent, inDegree.get(dependent) - 1)
      if (inDegree.get(dependent) === 0) {
        queue.push(dependent)
      }
    }
  }
  
  // Check for cycle
  if (sorted.length !== allNodes.size) {
    // Find nodes involved in cycle
    const cycleNodes = []
    for (const [node, degree] of inDegree) {
      if (degree > 0) {
        cycleNodes.push(node)
      }
    }
    return { order: [], cycle: cycleNodes }
  }
  
  return { order: sorted, cycle: null }
}

/**
 * Finds the cycle path for error reporting.
 * @param {Map<string, string[]>} graph - Dependency graph
 * @param {string[]} cycleNodes - Nodes in the cycle
 * @returns {string} Human-readable cycle path
 */
function findCyclePath(graph, cycleNodes) {
  // Simple approach: show all cycle nodes and their dependencies
  const lines = []
  for (const node of cycleNodes) {
    const relPath = path.relative(__dirname, node)
    const deps = graph.get(node) || []
    const depPaths = deps
      .filter(d => cycleNodes.includes(d))
      .map(d => path.relative(__dirname, d))
      .join(', ')
    lines.push(`  ${relPath} depends on: ${depPaths || '(no cycle deps)'}`)
  }
  return lines.join('\n')
}

/**
 * Builds a single HTML file, resolving all includes.
 * @param {string} filePath - Path to the HTML file
 * @param {Map<string, string>} cache - Cache of already built files
 * @returns {Promise<string>} Built HTML content
 */
async function buildFile(filePath, cache) {
  if (cache.has(filePath)) {
    return cache.get(filePath)
  }

  const content = readFileSync(filePath, 'utf8')

  const result = await posthtml([
    includePlugin({ encoding: 'utf8', root: SRC_DIR })
  ]).process(content, { from: filePath })

  const built = result.html
  cache.set(filePath, built)

  return built
}

/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dir - Directory path
 */
function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true })
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
}

/**
 * Converts a source file path to its output path.
 * @param {string} filePath - Source file path (e.g., src/foo/bar.page.html)
 * @returns {string} Output path (e.g., dist/foo/bar.html)
 */
function toOutputPath(filePath) {
  const relativePath = path.relative(SRC_DIR, filePath)
  // Replace .page.html with .html
  const outputPath = relativePath.replace(/\.page\.html$/, '.html')
  return path.join(DIST_DIR, outputPath)
}

/**
 * Finds all non-HTML files in a directory.
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of absolute file paths
 */
function findStaticFiles(dir) {
  const files = []
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...findStaticFiles(fullPath))
    } else if (!entry.endsWith('.html')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Copies static files from src/ to dist/.
 */
function copyStaticFiles() {
  const staticFiles = findStaticFiles(SRC_DIR)

  for (const srcFile of staticFiles) {
    const relativePath = path.relative(SRC_DIR, srcFile)
    const distPath = path.join(DIST_DIR, relativePath)
    const distDir = path.dirname(distPath)

    ensureDir(distDir)

    // Remove existing file if it exists
    try {
      if (existsSync(distPath)) {
        unlinkSync(distPath)
      }
      copyFileSync(srcFile, distPath)
      console.log(`Copied: ${relativePath}`)
    } catch (err) {
      console.error(`Failed to copy ${relativePath}: ${err.message}`)
    }
  }

  return staticFiles.length
}

/**
 * Main build function.
 */
async function build() {
  // Check if src directory exists
  try {
    statSync(SRC_DIR)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('Error: ./src directory does not exist')
      process.exit(1)
    }
    throw err
  }
  
  // Find all HTML files
  const files = findHtmlFiles(SRC_DIR)
  
  if (files.length === 0) {
    console.log('No HTML files found in ./src/')
    return
  }
  
  console.log(`Found ${files.length} HTML file(s)`)
  
  // Build dependency graph
  const graph = buildDependencyGraph(files)
  
  // Perform topological sort
  const { order, cycle } = topologicalSort(graph)
  
  if (cycle) {
    console.error('Error: Circular dependency detected!')
    console.error('Cycle involves:')
    console.error(findCyclePath(graph, cycle))
    process.exit(1)
  }
  
  console.log('Build order:', order.map(f => path.relative(__dirname, f)).join(' -> '))
  
  // Create output and cache directories
  ensureDir(DIST_DIR)
  ensureDir(BUILD_DIR)

  // Copy static files (images, archives, etc.)
  const staticCount = copyStaticFiles()
  if (staticCount > 0) {
    console.log(`Copied ${staticCount} static file(s)`)
  }

  const cache = new Map()
  
  // Build and write files
  for (const file of order) {
    const relativePath = path.relative(SRC_DIR, file)
    
    if (file.endsWith('.comp.html')) {
      // Components: build to cache only
      console.log(`Building component: ${relativePath}`)
      await buildFile(file, cache)
      // Write to cache
      const cachePath = path.join(BUILD_DIR, relativePath)
      ensureDir(path.dirname(cachePath))
      writeFileSync(cachePath, cache.get(file), 'utf8')
    } else if (file.endsWith('.page.html')) {
      // Pages: build to output
      console.log(`Building page: ${relativePath}`)
      const built = await buildFile(file, cache)
      const outputPath = toOutputPath(file)
      ensureDir(path.dirname(outputPath))
      writeFileSync(outputPath, built, 'utf8')
    } else {
      // Other HTML files: build to output (treat as pages)
      console.log(`Building: ${relativePath}`)
      const built = await buildFile(file, cache)
      const outputPath = path.join(DIST_DIR, relativePath)
      ensureDir(path.dirname(outputPath))
      writeFileSync(outputPath, built, 'utf8')
    }
  }
  
  console.log('Build complete!')
}

build().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
