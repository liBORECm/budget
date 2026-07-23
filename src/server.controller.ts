import express from 'express'
import fs from 'fs'
import path from 'path'

const router = express.Router()

fs.readdirSync(__dirname, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'common')
    .forEach(entry => {
        const controllerFile = path.join(__dirname, entry.name, `${entry.name}.controller`)
        const exists = ['.ts', '.js'].some(ext => fs.existsSync(controllerFile + ext))
        if (exists) {
            const mod = require(controllerFile)
            router.use('/api/v1/', mod.default ?? mod)
        }
    })

export default router
