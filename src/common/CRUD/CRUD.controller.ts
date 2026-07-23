import express, { Router } from 'express'
import { CRUDService } from './CRUD.service'
import { Knex } from 'knex'
import { CRUDEntity } from './CRUD.model'
import HttpError, { InternalError, isHttpError, NotFound } from '../httpError'

export default abstract class CRUDController<
    Entity extends CRUDEntity,
    EnrichedEntity extends Entity,
    Service extends CRUDService<Entity, EnrichedEntity>,
> {
    service: Service

    constructor(service: Service) {
        this.service = service
    }

    public routes(): Router {
        const router = express.Router()

        router.get('/', async (req, res) => {
            const { sort: presort, offset, limit, ...filters } = req.query
            const attribute =
                !presort || typeof presort !== 'string'
                    ? undefined
                    : presort[0] === '-'
                      ? presort.substring(1)
                      : presort
            const order =
                !presort || typeof presort !== 'string'
                    ? undefined
                    : presort[0] !== '-'
                      ? 'ASC'
                      : 'DESC'

            const sort =
                attribute !== undefined && order !== undefined
                    ? { attribute, order: order as 'ASC' | 'DESC' }
                    : undefined

            const modifier = (query: Knex.QueryBuilder) => {
                for (const [column, value] of Object.entries(filters)) {
                    query = query.where(column, value)
                }

                return query
            }

            try {
                const result = await this.service.getAll(
                    modifier,
                    sort,
                    Number(offset),
                    Number(limit),
                )
                return res.status(200).json(result)
            } catch (e) {
                console.log(e)
                if (isHttpError(e))
                    return res.status(e.status).json({ error: e.message })

                const { status, message } = InternalError
                return res.status(status).json({ error: message })
            }
        })

        router.get('/:id', async (req, res) => {
            const id = Number(req.params.id)
            try {
                const result = await this.service.get(id)
                if (result == undefined) {
                    const { status, message } = NotFound
                    return res.status(status).json({ error: message })
                }
                return res.status(200).json(result)
            } catch (e) {
                console.log(e)
                if (isHttpError(e))
                    return res.status(e.status).json({ error: e.message })

                const { status, message } = InternalError
                return res.status(status).json({ error: message })
            }
        })

        router.patch('/:id', async (req, res) => {
            const id = Number(req.params.id)
            const newRecord = req.body as Entity
            ;(newRecord as any).id = undefined

            try {
                const result = await this.service.get(id)
                if (result == undefined) {
                    const { status, message } = NotFound
                    return res.status(status).json({ error: message })
                }

                const patched = await this.service.edit(id, newRecord)
                const patchedRecord = await this.service.get(id)

                if (!patched || !patchedRecord) {
                    const { status, message } = InternalError
                    return res.status(status).json({ error: message })
                }
                return res.status(200).json(patchedRecord)
            } catch (e) {
                console.log(e)
                if (isHttpError(e))
                    return res.status(e.status).json({ error: e.message })

                const { status, message } = InternalError
                return res.status(status).json({ error: message })
            }
        })

        router.post('/', async (req, res) => {
            const newRecord = req.body as Entity
            ;(newRecord as any).id = undefined

            try {
                const created = await this.service.create(newRecord)
                if (!created) {
                    const { status, message } = InternalError
                    return res.status(status).json({ error: message })
                }

                return res.status(200).json(created)
            } catch (e) {
                console.log(e)
                if (isHttpError(e))
                    return res.status(e.status).json({ error: e.message })

                const { status, message } = InternalError
                return res.status(status).json({ error: message })
            }
        })

        router.delete('/:id', async (req, res) => {
            const id = Number(req.params.id)

            try {
                /**
                 * Check if record exists
                 */
                await this.service.get(id)

                const deleted = await this.service.delete(id)
                if (!deleted) throw new HttpError(InternalError)

                return res.sendStatus(200)
            } catch (e) {
                console.log(e)
                if (isHttpError(e))
                    return res.status(e.status).json({ error: e.message })

                const { status, message } = InternalError
                return res.status(status).json({ error: message })
            }
        })

        return router
    }
}
