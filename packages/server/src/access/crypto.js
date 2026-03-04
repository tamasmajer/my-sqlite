// Crypto facade — wraps node:crypto for token generation
import { randomBytes } from 'node:crypto'

export function token(len = 32) {
  return randomBytes(len).toString('hex')
}
