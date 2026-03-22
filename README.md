# PostHTML-build

Template repository for building static websites with minimal effort. 

**Features**: 
- File System Routing,
- HTML Components via <a href="https://github.com/posthtml/posthtml-include">PostHTML</a>,
- ready for serving via docker.

Example source tree:
```
src
├── blog
│   └── index.page.html
├── components
│   ├── footer.comp.html
│   ├── header.comp.html
│   └── nav.comp.html
└── index.page.html
```

Example dist tree containing merged HTML files:
```
dist
├── blog
│   └── index.html
└── index.html
```

## Include Syntax

```html
<!-- relative to importing file -->
<include src="./button.comp.html"></include>
<include src="button.comp.html"></include>
<!-- absolut to projects ./src dir -->
<include src="/components/header.comp.html"></include>
```

See <a href="https://github.com/posthtml/posthtml-include">PostHTML</a> for more details, like parameters.


## Usage

Build website:
```bash
npm install # install build.js dependencies
npm run build # run build.js
```

Create and run container with mounted `./dist` volume:
```bash
docker compose up -d --build
```

## File Conventions

| Pattern | Purpose | Output |
|---------|---------|--------|
| `*.page.html` | Page template | `./dist/` |
| `*.comp.html` | Reusable component | `./build/` |


## Build Process

1. **Discovery** — Recursively locate all HTML files in `./src/`
2. **Dependency Analysis** — Extract `<include src="...">` references using regex
3. **Topological Sort** — Order files using Kahn's algorithm to satisfy dependencies
4. **Build** — Process each file with PostHTML, resolving includes via `posthtml-include`
5. **Write** — Components → `./build/`, Pages → `./dist/`
6. **Copy** - static resources → `./dist`.

