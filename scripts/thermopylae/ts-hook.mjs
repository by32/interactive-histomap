// Lets Node (with --experimental-strip-types) import the page's TypeScript
// modules as they are: Vite resolves extensionless relative imports, Node
// does not, so a relative specifier without an extension gets `.ts` added.
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[cm]?[jt]sx?$|\\.json$/.test(specifier)) {
          try { return await next(specifier + '.ts', context) } catch {}
        }
        return next(specifier, context)
      }
    `),
  import.meta.url,
)
