# PostHTML-static

Developing, building, serving and distributing static websites should be not harder than writing HTML.
The JS library PostHTML-include provides an HTML `include` tag for importing other HTML moduls.
Our build script can resolve nested HTML moduls into servable HTML files.
Nginx is configured to serve the file tree via HTTP. 
We refer to the served file tree as *dist tree*. 
And the preconfigured docker container is used for distributing the dist tree and Nginx.

The build script diffirentiates between components and pages via the file extension.
- A page can be accessed by users.
- A component can only be accessed if it is included in a page. 

Example source tree:
```
src
├── blog
│   └── index.page.html
├── components
│   ├── footer.comp.html
│   ├── header.comp.html
│   └── nav.comp.html
├── images
│   └── logo.png
└── index.page.html
```

Resulting dist tree:
```
dist
├── blog
│   └── index.html
├── images
│   └── logo.png
└── index.html

```
Note: Non HTML files, like `images/logo.png`, are also copied to the distributed tree.

## Include Syntax

```html
<!-- relative to importing file -->
<include src="./button.comp.html"></include>
<include src="button.comp.html"></include>
<!-- absolut to projects ./src dir -->
<include src="/components/header.comp.html"></include>
```

See <a href="https://github.com/posthtml/posthtml-include">PostHTML-include</a> for more details, like passing parameters.

## Usage

Build website:
```bash
# setup
npm install # install build.js dependencies

# build pages once
npm run build
# build pages every few seconds. 
npm run dev
```

The docker container is configured to mount the `./dist` directory as a volume.
Therefore, changed in the dist tree are reflected without the need to rebuild the container.
```bash
docker compose up -d --build
```
For distribution, its recommended to comment the `./dist` volume inside the docker compose file before building the container.
Otherwise, the copied dist tree might not be accessible to Nginx.


## How the building process works?

1. Find all HTML files in `src/`
2. Parse each file to extract `<include>` tags
3. Find a topological ordering; abort if circular
4. Process each HTML file:
   - Inline included components
   - Cache newly built component
5. Write dist tree

