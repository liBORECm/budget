# TypeScript Fullstack Template

Express + Knex backend template with a class-based entity architecture. Each entity is self-contained in its own folder and auto-registered as a router — adding a new resource requires no changes outside its own folder.

## Stack

- **Runtime**: Node.js 22+ / TypeScript (ts-node in dev, tsc for prod)
- **Framework**: Express 5
- **Database**: MySQL / MariaDB via Knex (automatic camelCase ↔ snake_case mapping)
- **API docs**: Swagger (JSDoc annotations, served at `/api-docs`)
- **Frontend**: React 19 + Vite (built into `dist/`, served by Express)
- **Code quality**: Prettier + lint-staged + Husky

---

## Getting started

### 1. Clone and rename

```sh
git clone <this-repo> my-project
cd my-project
git init   # start a fresh git history
```

Update `name`, `version`, `description` in `package.json`.

### 2. Create a database

```sql
CREATE DATABASE my_project;
```

### 3. Create `.env`

```
PORT=5533
DB_HOST=localhost
DB_NAME=my_project
DB_USER=root
DB_PWD=your_password
```

### 4. Install dependencies

```sh
npm install
cd frontend && npm install && cd ..
```

### 5. Run migrations

```sh
npx knex migrate:latest
```

### 6. Start development

```sh
npm run dev        # backend with nodemon
cd frontend && npm run dev   # frontend with Vite HMR
```

---

## Frontend

The frontend lives in `frontend/` and is a standard React + Vite + TypeScript app.

**What's included out of the box:**

- `src/App.tsx` — minimal entry point with a navbar + page layout using the built-in CSS classes
- `src/index.css` — design system with CSS variables (colors, shadows, radii) and reusable utility classes: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.form-input`, `.form-card`, `.dialog`, `.empty-state`, `.spinner`, `.toggle-chip`, and more
- `src/api.ts` — a generic `request<T>(path, options?)` helper that calls `/api/v1/*`, handles errors and parses JSON; import and extend it per entity
- `react-router-dom` and `react-hot-toast` are already installed

**Adding a page:**

1. Create `frontend/src/pages/FooPage.tsx`
2. Import and add a `<Route>` in `App.tsx` (wrap the app in `<BrowserRouter>` first)
3. Call the backend via `request<Foo[]>('/foo')` from `api.ts`

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend in watch mode (nodemon + ts-node) |
| `npm run build` | Build frontend + generate Swagger + compile TypeScript |
| `npm run swagger` | Regenerate Swagger docs only |
| `npm run migrate:latest` | Apply all pending migrations |
| `npm run migrate:up` | Apply one migration up |
| `npm run migrate:down` | Roll back one migration |
| `npm run migrate:make <name>` | Create a new migration file (`db/migrations/<timestamp>_<name>.ts`) |
| `npm run entity <name>` | Create a new entity int he codebase |

---

## Project structure

```
src/
├── common/
│   ├── CRUD/
│   │   ├── CRUD.model.ts          # Base entity class (id, createdAt, updatedAt, deletedAt)
│   │   ├── CRUD.service.ts        # Generic CRUD service
│   │   └── CRUD.controller.ts     # Generic CRUD controller
│   └── httpError.ts
├── <entity>/                      # one folder per entity
│   ├── <entity>.model.ts
│   ├── <entity>.service.ts
│   └── <entity>.controller.ts     # auto-loaded by server.controller.ts
├── server.controller.ts           # auto-registers all entity controllers
├── server.ts                      # Express entry point
├── swagger.ts
└── db.ts
```

`server.controller.ts` scans every direct subfolder of `src/` (except `common`) and mounts the file matching `<dirname>/<dirname>.controller.ts` at `/api/v1/`.

---

## Adding a new entity

### Option A — generator (recommended)

```sh
npm run entity <entityName>
```

Creates all three files, a migration with `id`/`created_at`/`updated_at`/`deleted_at`, and registers the route automatically. Input can be camelCase or PascalCase.

```sh
npm run entity productItem
# creates:
#   src/productItem/productItem.model.ts
#   src/productItem/productItem.service.ts
#   src/productItem/productItem.controller.ts
#   db/migrations/<timestamp>_product_item_create.ts
```

Then add your fields to the model and migration and run `npm run migrate:latest`.

---

### Option B — manually

Create a folder `src/<entity>/` with three files. Nothing else needs to change.

### 1. Model — `<entity>.model.ts`

Define a **base** class (mirrors the DB row) and an **enriched** class (adds computed fields or joined relations returned by the API).

```typescript
import { CRUDEntity } from '../common/CRUD/CRUD.model'
// or: import any other abstract class in common that extends CRUDEntity

// Base = DB row shape
export class FooBase extends CRUDEntity {
    constructor(
        public id: number,
        public createdAt: Date,
        public updatedAt: Date,
        public deletedAt: Date | null,
        public name: string,
        public barId: number,
    ) {
        super(id, createdAt, updatedAt, deletedAt)
    }
}

// Enriched = base + joined / computed data
export class Foo extends FooBase {
    constructor(
        public id: number,
        public createdAt: Date,
        public updatedAt: Date,
        public deletedAt: Date | null,
        public name: string,
        public barId: number,
        public bars: BarBase[],   // extra field
    ) {
        super(id, createdAt, updatedAt, deletedAt, name, barId)
    }
}
```

If no enrichment is needed, use the same class for both type parameters.

Knex is configured with `knexSnakeCaseMappers()` — write TypeScript properties in **camelCase**, DB columns are **snake_case**, the mapping is automatic.

---

### 2. Service — `<entity>.service.ts`

```typescript
import { CRUDService } from '../common/CRUD/CRUD.service'
// or: import any other abstract class in common that extends CRUDService
import { FooBase, Foo } from './foo.model'

class FooService extends CRUDService<FooBase, Foo> {
    constructor() {
        super('foos') // DB table name
    }

    // Override get() to enrich the base record with relations
    public get(id: number): Promise<Foo> {
        return super.get(id, async (base) => {
            const bars = await this.getAll((q) => q.where('foo_id', base.id))
            return new Foo(
                base.id, base.createdAt, base.updatedAt, base.deletedAt,
                base.name, base.barId,
                bars,
            )
        })
    }

    // Override create() / edit() to add validation via the approve hook
    public create(record: FooBase): Promise<FooBase> {
        return super.create(record, async (base) => {
            // throw new HttpError(...) here to reject the operation
        })
    }
}

export default new FooService()   // singleton — default export used by the controller
export { FooService }             // named export for the controller's type parameter
```

**Base methods from `CRUDService`:**

| Method | Description |
|---|---|
| `getAll(modifier?, sort?, offset?, limit?)` | All non-deleted rows; `modifier` is a Knex query callback |
| `get(id, enrich?)` | One row; throws `NotFound` if missing |
| `create(record, approveCreate?)` | Insert; sets `createdAt`/`updatedAt` automatically |
| `edit(id, record, approveEdit?)` | Update; sets `updatedAt` automatically |
| `delete(id, approveDelete?)` | Soft-delete via `deletedAt` |

The optional `approveX` callbacks run before the DB write — throw an `HttpError` to abort.

---

### 3. Controller — `<entity>.controller.ts`

```typescript
import express, { Router } from 'express'
import CRUDController from '../common/CRUD/CRUD.controller'
// or: import any other abstract class in common that extends CRUDController
import { FooBase, Foo } from './foo.model'
import fooService, { FooService } from './foo.service'

class FooController extends CRUDController<FooBase, Foo, FooService> {
    constructor() {
        super(fooService)
    }

    public routes(): Router {
        const router = super.routes() // inherits GET /, GET /:id, POST /, PATCH /:id, DELETE /:id

        // Add custom routes on top
        router.get('/export', async (req, res) => {
            // ...
        })

        // Wrap under the URL prefix for this entity and return
        const router0 = express.Router()
        router0.use('/foo', router)
        return router0
    }
}

export default new FooController().routes()  // must be the default export
```

The default export is what `server.controller.ts` picks up and mounts at `/api/v1/`.

**Routes inherited from `CRUDController`:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List all; supports `sort` (`-field` for DESC), `offset`, `limit`, and any column as a filter query param |
| `GET` | `/:id` | Get one by id |
| `POST` | `/` | Create |
| `PATCH` | `/:id` | Partial update |
| `DELETE` | `/:id` | Soft-delete |

---

## Swagger docs

Swagger UI is served at `/api-docs`. The spec is generated from JSDoc `@swagger` annotations in `*.model.ts` and `*.controller.ts` files — both are scanned automatically, no registration needed.

Regenerate during development with:

```sh
npm run swagger
```

### Schemas — `<entity>.model.ts`

Define one `@swagger` block per schema. You typically need four:

| Schema name | Purpose |
|---|---|
| `Foo` | Full response object (all fields) |
| `FooInput` | POST body (required fields only, no `id`/timestamps) |
| `FooPatchInput` | PATCH body (same fields as Input but all optional) |
| `FooEnriched` | Only if the enriched response shape differs from `Foo` |

```typescript
/**
 * @swagger
 * components:
 *  schemas:
 *      Foo:
 *          type: object
 *          required:
 *              - id
 *              - name
 *              - barId
 *              - createdAt
 *              - updatedAt
 *          properties:
 *              id:
 *                  type: number
 *              name:
 *                  type: string
 *              barId:
 *                  type: number
 *              createdAt:
 *                  type: string
 *                  format: date-time
 *              updatedAt:
 *                  type: string
 *                  format: date-time
 *              deletedAt:
 *                  type: string
 *                  format: date-time
 *                  nullable: true
 *              bars:
 *                  type: array
 *                  items:
 *                      $ref: '#/components/schemas/Bar'
 *
 *      FooInput:
 *          type: object
 *          required:
 *              - name
 *              - barId
 *          properties:
 *              name:
 *                  type: string
 *              barId:
 *                  type: number
 *
 *      FooPatchInput:
 *          type: object
 *          properties:
 *              name:
 *                  type: string
 *              barId:
 *                  type: number
 */
```

### Routes — `<entity>.controller.ts`

Document each endpoint in a separate `@swagger` block after the class. Reference only the schemas defined in the model and the shared error schemas from `httpError.ts`.

**Shared error schemas** (always available via `$ref`):

| `$ref` | HTTP status |
|---|---|
| `#/components/schemas/NotFoundError` | 404 |
| `#/components/schemas/BadRequestError` | 400 |
| `#/components/schemas/InternalError` | 500 |

```typescript
/**
 * @swagger
 * /api/v1/foo:
 *  get:
 *      tags:
 *          - Foo
 *      summary: Get all foos
 *      parameters:
 *          - name: sort
 *            in: query
 *            schema:
 *              type: string
 *            description: Column to sort by. Prefix with '-' for descending (e.g. '-name').
 *          - name: offset
 *            in: query
 *            schema:
 *              type: number
 *          - name: limit
 *            in: query
 *            schema:
 *              type: number
 *      responses:
 *          200:
 *              description: List of foos
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: array
 *                          items:
 *                              $ref: '#/components/schemas/Foo'
 *          500:
 *              description: Internal error
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/InternalError'
 *
 *  post:
 *      tags:
 *          - Foo
 *      summary: Create a foo
 *      requestBody:
 *          required: true
 *          content:
 *              application/json:
 *                  schema:
 *                      $ref: '#/components/schemas/FooInput'
 *      responses:
 *          200:
 *              description: Created foo
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/Foo'
 *          500:
 *              description: Internal error
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/InternalError'
 *
 * /api/v1/foo/{id}:
 *  get:
 *      tags:
 *          - Foo
 *      summary: Get one foo by id
 *      parameters:
 *          - name: id
 *            in: path
 *            required: true
 *            schema:
 *              type: number
 *      responses:
 *          200:
 *              description: The foo
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/Foo'
 *          404:
 *              description: Not found
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/NotFoundError'
 *          500:
 *              description: Internal error
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/InternalError'
 *
 *  patch:
 *      tags:
 *          - Foo
 *      summary: Update a foo
 *      parameters:
 *          - name: id
 *            in: path
 *            required: true
 *            schema:
 *              type: number
 *      requestBody:
 *          required: true
 *          content:
 *              application/json:
 *                  schema:
 *                      $ref: '#/components/schemas/FooPatchInput'
 *      responses:
 *          200:
 *              description: Updated foo
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/Foo'
 *          404:
 *              description: Not found
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/NotFoundError'
 *          500:
 *              description: Internal error
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/InternalError'
 *
 *  delete:
 *      tags:
 *          - Foo
 *      summary: Delete a foo
 *      parameters:
 *          - name: id
 *            in: path
 *            required: true
 *            schema:
 *              type: number
 *      responses:
 *          200:
 *              description: Deleted successfully
 *          404:
 *              description: Not found
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/NotFoundError'
 *          500:
 *              description: Internal error
 *              content:
 *                  application/json:
 *                      schema:
 *                          $ref: '#/components/schemas/InternalError'
 */
```

For custom routes just add more paths to the same block or open a new `@swagger` block — multiple blocks per file are fine.

---

## Error handling

```typescript
import HttpError, { NotFound, InternalError } from '../common/httpError'

throw new HttpError(NotFound)
```

The base controllers catch `HttpError` and respond with the correct HTTP status. Unhandled errors fall back to 500.
