// @ts-check
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const arg = process.argv[2]
if (!arg) {
    console.error('Usage: npm run entity <entityName>')
    process.exit(1)
}

const toPascal = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const toCamel = (s) => s.charAt(0).toLowerCase() + s.slice(1)
const toSnake = (s) =>
    s
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')
const toKebab = (s) => toSnake(s).replace(/_/g, '-')

const pascal = toPascal(arg)
const camel = toCamel(arg)
const snake = toSnake(arg)
const kebab = toKebab(arg)
const table = snake + 's'

const root = path.resolve(__dirname, '..')
const entityDir = path.join(root, 'src', camel)

if (fs.existsSync(entityDir)) {
    console.error(`Entity "${camel}" already exists.`)
    process.exit(1)
}

fs.mkdirSync(entityDir)

fs.writeFileSync(
    path.join(entityDir, `${camel}.model.ts`),
    `import { CRUDEntity } from '../common/CRUD/CRUD.model'

export class ${pascal}Base extends CRUDEntity {
    constructor(
        public id: number,
        public createdAt: Date,
        public updatedAt: Date,
        public deletedAt: Date | null,
        // add your fields here
    ) {
        super(id, createdAt, updatedAt, deletedAt)
    }
}

export class ${pascal} extends ${pascal}Base {
    constructor(
        public id: number,
        public createdAt: Date,
        public updatedAt: Date,
        public deletedAt: Date | null,
        // add your fields here (enriched fields, e.g. joined relations)
        // if base class and enriched class were to be the same, feel free to remove the base class and use this class in place for both base and enriched class
    ) {
        super(id, createdAt, updatedAt, deletedAt)
    }
}
`,
)

fs.writeFileSync(
    path.join(entityDir, `${camel}.service.ts`),
    `import { CRUDService } from '../common/CRUD/CRUD.service'
import { ${pascal}Base, ${pascal} } from './${camel}.model'

class ${pascal}Service extends CRUDService<${pascal}Base, ${pascal}> {
    constructor() {
        super('${table}')
    }
}

export default new ${pascal}Service()
export { ${pascal}Service }
`,
)

fs.writeFileSync(
    path.join(entityDir, `${camel}.controller.ts`),
    `import express, { Router } from 'express'
import CRUDController from '../common/CRUD/CRUD.controller'
import { ${pascal}Base, ${pascal} } from './${camel}.model'
import ${camel}Service, { ${pascal}Service } from './${camel}.service'

class ${pascal}Controller extends CRUDController<${pascal}Base, ${pascal}, ${pascal}Service> {
    constructor() {
        super(${camel}Service)
    }

    public routes(): Router {
        const router = super.routes()

        const router0 = express.Router()
        router0.use('/${kebab}', router)
        return router0
    }
}

export default new ${pascal}Controller().routes()
`,
)

execSync(`npx knex migrate:make ${snake}_create -x ts`, {
    stdio: 'inherit',
    cwd: root,
})

const migrationsDir = path.join(root, 'db', 'migrations')
const latest = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .at(-1)

fs.writeFileSync(
    path.join(migrationsDir, latest),
    `import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('${table}', (table) => {
        table.increments('id').primary()
        table.timestamp('created_at').notNullable()
        table.timestamp('updated_at').notNullable()
        table.timestamp('deleted_at').nullable()
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('${table}')
}
`,
)

console.log(`\nEntity "${pascal}" created:`)
console.log(`  src/${camel}/${camel}.model.ts`)
console.log(`  src/${camel}/${camel}.service.ts`)
console.log(`  src/${camel}/${camel}.controller.ts`)
console.log(`  db/migrations/${latest}`)
