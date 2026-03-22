# PostHTML-static

Template repository for building static websites with minimal effort. 

**Features**: 
- File System Routing,
- HTML Components via <a href="https://github.com/posthtml/posthtml-include">PostHTML-include</a>,
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

Resulting dist tree (containing merged HTML files):
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
`./src` contains an example website.

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

