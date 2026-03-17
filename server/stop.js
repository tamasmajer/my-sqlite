// Stop — kills a running server
import * as Server from './access/server.js'
import * as Proc from './access/env/process.js'

if (!Server.isRunning()) {
  console.log('No running server found')
  Proc.exit(1)
}
Server.stop()
console.log('Server stopped')
