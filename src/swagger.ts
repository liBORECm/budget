import { version, name } from '../package.json'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import { Application, Request, Response } from 'express'

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: name,
            version,
        },
    },
    apis: [
        './src/*/*.controller.ts',
        './src/*/*.model.ts',
        './src/common/httpError.ts',
    ],
}

const swaggerSpec = swaggerJsdoc(options)

export default function swaggerDocs(app: Application) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

    app.get('/api-docs.json', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        res.send(swaggerSpec)
    })
}
