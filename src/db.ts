import { knex } from 'knex'
import { knexSnakeCaseMappers } from 'objection'

const db = knex({
    client: 'mysql',
    connection: {
        host: process.env.DB_HOST || 'localhost',
        port: 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PWD || '',
        database: process.env.DB_NAME || 'my_project',
    },

    ...knexSnakeCaseMappers(),
})

export default db
