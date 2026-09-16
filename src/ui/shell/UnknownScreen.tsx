// Reference §11: the fallback route for an unknown screen path.
import { SidebarInset } from '../components/ui/sidebar.js'
import { href } from '../router/route.js'
import { screenLabel } from '../store/labels.js'

export function UnknownScreen({ path, screens }: { path: string; screens: readonly string[] }) {
  return (
    <SidebarInset className="gap-2 p-6">
      <p>No screen &quot;{path}&quot; in this prototype.</p>
      <p className="text-muted-foreground">
        Available:{' '}
        {screens.map((n) => (
          <a key={n} className="mr-3 underline" href={href({ kind: 'screen', screen: n })}>
            {screenLabel(n)}
          </a>
        ))}
      </p>
    </SidebarInset>
  )
}
