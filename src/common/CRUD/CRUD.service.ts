import db from '../../db'
import { Knex } from 'knex'
import { CRUDEntity } from './CRUD.model'
import HttpError, { NotFound } from '../httpError'

export abstract class CRUDService<
    Entity extends CRUDEntity,
    EnrichedEntity extends Entity,
> {
    tableName: string

    constructor(tableName: string) {
        this.tableName = tableName
    }

    public async getAll(
        modifier?: Knex.QueryCallbackWithArgs<any, any>,
        sort?: { attribute: string; order: 'ASC' | 'DESC' },
        offset?: number,
        limit?: number,
    ): Promise<Array<Entity>> {
        let query = db(this.tableName).where('deleted_at', null)

        if (modifier !== undefined) query = query.modify(modifier)
        if (sort !== undefined)
            query = query.orderBy(sort.attribute, sort.order)
        if (offset !== undefined) query = query.offset(offset)
        if (limit !== undefined) query = query.limit(limit)

        return (await query) as Array<Entity>
    }

    public async getAllEnriched(
        enrich: (record: Entity) => Promise<EnrichedEntity>,
        modifier?: Knex.QueryCallbackWithArgs<any, any>,
        sort?: { attribute: string; order: 'ASC' | 'DESC' },
        offset?: number,
        limit?: number,
    ): Promise<Array<EnrichedEntity>> {
        let query = db(this.tableName).where('deleted_at', null)

        if (modifier !== undefined) query = query.modify(modifier)
        if (sort !== undefined)
            query = query.orderBy(sort.attribute, sort.order)
        if (offset !== undefined) query = query.offset(offset)
        if (limit !== undefined) query = query.limit(limit)

        const base = (await query) as Array<Entity>

        const enriched = [] as Array<EnrichedEntity>
        for(const record of base) {
            enriched.push(await enrich(record))
        }

        return enriched
    } 

    public async get(
        id: number,
        enrich?: (record: Entity) => Promise<EnrichedEntity>,
    ): Promise<EnrichedEntity> {
        const base = await db(this.tableName)
            .where('deleted_at', null)
            .where('id', id)
            .first()

        if (base === undefined) throw new HttpError(NotFound)
        if (enrich === undefined) return base
        return await enrich(base)
    }

    public async create(
        record: Entity,
        approveCreate?: (record: Entity) => Promise<void>,
    ): Promise<Entity> {
        if (approveCreate !== undefined) await approveCreate(record)

        ;(record as any).id = undefined
        ;(record as any).createdAt = new Date()
        ;(record as any).updatedAt = new Date()
        ;(record as any).deletedAt = undefined

        const resultId = Number(
            (await db(this.tableName).insert(record, 'id'))[0],
        )
        const result = await this.get(resultId)
        return result
    }

    public async edit(
        id: number,
        record: Entity,
        approveEdit?: (record: Entity) => Promise<void>,
    ): Promise<EnrichedEntity> {
        if (approveEdit !== undefined) await approveEdit(record)

        ;(record as any).id = undefined
        record.updatedAt = new Date()
        await db(this.tableName).where('id', id).update(record)
        return await this.get(id)
    }

    public async delete(
        id: number,
        approveDelete?: () => Promise<void>,
    ): Promise<boolean> {
        if (approveDelete !== undefined) await approveDelete()

        const affected = await db(this.tableName)
            .where('id', id)
            .update({ deletedAt: new Date() })
        return affected === 1
    }
}
