import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'pathe'
import { destr } from 'destr'
import mri from 'mri'
import * as rc from 'rc9'
import c from 'chalk'
import { consola } from 'consola'
import jiti from 'jiti'
import { isTest } from 'std-env'
import { parse as praseDotenv } from 'dotenv'
import { consentVersion } from './meta'
import { ensureUserconsent } from './consent'

export const usage = 'npx nuxt-telemetry `status`|`enable`|`disable`|`consent` [`-g`,`--global`] [`dir`]'
const RC_FILENAME = '.nuxtrc'

function _run () {
  const _argv = process.argv.slice(2)
  const args = mri(_argv, {
    boolean: [
      '--global'
    ],
    alias: {
      '-g': '--global'
    }
  })
  const [command, _dir = '.'] = args._
  const dir = resolve(process.cwd(), _dir)
  const global = args['--global']

  if (!global && !existsSync(resolve(dir, 'nuxt.config.js')) &&
    !existsSync(resolve(dir, 'nuxt.config.ts'))) {
    consola.error('It seems you are not in a nuxt project!')
    consola.info('You can try with providing dir or using `-g`')
    showUsage()
  }

  switch (command) {
    case 'enable':
      setRC('telemetry.enabled', true)
      setRC('telemetry.consent', consentVersion)
      showStatus()
      consola.info('You can disable telemetry with `npx nuxt-telemetry disable ' + (global ? '-g' : _dir))
      return
    case 'disable':
      setRC('telemetry.enabled', false)
      setRC('telemetry.consent', 0)
      showStatus()
      consola.info('You can enable telemetry with `npx nuxt-telemetry enable ' + (global ? '-g' : _dir) + '`')
      return
    case 'status':
      return showStatus()
    case 'consent':
      return _prompt()
    default:
      showUsage()
  }

  async function _prompt () {
    const accepted = await ensureUserconsent({} as any) // <-- always sets global
    if (accepted && !global) {
      setRC('telemetry.enabled', true)
      setRC('telemetry.consent', consentVersion)
    }
    showStatus()
  }

  function _checkDisabled (): string | false | undefined {
    // test
    if (isTest) {
      return 'Because running in test environment'
    }

    // env
    if (destr(process.env.NUXT_TELEMETRY_DISABLED)) {
      return 'by `NUXT_TELEMETRY_DISABLED` environment variable'
    }

    // dotenv
    const dotenvFile = resolve(dir, '.env')
    if (existsSync(dotenvFile)) {
      const _env = praseDotenv(readFileSync(dotenvFile))
      if (destr(_env.NUXT_TELEMETRY_DISABLED)) {
        return 'by `NUXT_TELEMETRY_DISABLED` from ' + dotenvFile
      }
    }

    const disabledByConf = (conf: any) => conf.telemetry === false ||
      (conf.telemetry && conf.telemetry.enabled === false)

    // nuxt.config
    try {
      const _require = jiti(dir)
      if (disabledByConf(_require('./nuxt.config'))) {
        return 'by ' + _require.resolve('./nuxt.config')
      }
    } catch (_) {}

    // Projct .nuxtrc
    if (disabledByConf(rc.read({ name: RC_FILENAME, dir }))) {
      return 'by ' + resolve(dir, RC_FILENAME)
    }

    // Global .nuxtrc
    if (disabledByConf(rc.readUser({ name: RC_FILENAME }))) {
      return 'by ' + resolve(homedir(), RC_FILENAME)
    }
  }

  function showStatus () {
    const disabled = _checkDisabled()
    if (disabled) {
      consola.info(`Nuxt telemetry is ${c.yellow('disabled')} ${disabled}`)
    } else {
      consola.info(`Nuxt telemetry is ${c.green('enabled')}`, global ? 'on machine' : 'on current project')
    }
  }

  function showUsage () {
    consola.info(`Usage: ${usage}`)
    process.exit(0)
  }

  function setRC (key: any, val: any) {
    const update = { [key]: val }
    if (global) {
      rc.updateUser(update, RC_FILENAME)
    } else {
      rc.update(update, { name: RC_FILENAME, dir })
    }
  }
}

export function main () {
  try {
    _run()
  } catch (err) {
    consola.fatal(err)
    process.exit(1)
  }
}
