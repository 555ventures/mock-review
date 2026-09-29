// Reference §8.2: journey controls in a bar below the device frame(s).
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '../components/ui/button.js'
import { Toggle } from '../components/ui/toggle.js'
import { href } from '../router/route.js'
import { stepLabel } from '../store/labels.js'
import type { GuideHint, GuideStep } from './useJourneyGuide.js'
import type { LocateEdge } from './locate.js'

function stepHref(id: string, steps: GuideStep[], i: number): string {
  const s = steps[i]
  if (!s) return '#/'
  return href({ kind: 'screen', screen: s.screen, state: s.state, journey: id, step: i })
}

export function JourneyPill({
  journeyId,
  title,
  steps,
  edges,
  idx,
  hints,
  guideOn,
  setGuideOn,
  simple = false,
}: {
  journeyId: string
  title: string
  steps: GuideStep[]
  edges: LocateEdge[]
  idx: number
  hints: GuideHint[]
  guideOn: boolean
  setGuideOn: (on: boolean) => void
  /** U5: a screenshots round — Back / Next only, no hints, no guide ring, no "(control not found)". */
  simple?: boolean
}) {
  const back = simple ? (idx > 0 ? { from: idx - 1 } : undefined) : idx > 0 ? (edges.find((e) => e.to === idx) ?? { from: idx - 1 }) : undefined
  const skip = simple ? undefined : idx >= 0 ? edges.find((e) => e.from === idx) : undefined
  // Steps are linear in a walkthrough journey, and two steps on the same screen have no edge
  // between them (seam B derives edges only where the screen changes) — so with no edge out of a
  // step that is not the last, the pill still offers the next step instead of "End of".
  const next = idx >= 0 && idx < steps.length - 1 && (simple || (!skip && hints.length === 0)) ? idx + 1 : undefined
  const first = steps[0]

  return (
    <div className="mt-4 flex w-full justify-center">
      <div className="flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-1 shadow-md">
        {idx < 0 ? (
          <>
            <span className="px-2 text-sm text-muted-foreground">Not on {title}</span>
            <Button size="sm" variant="link" asChild>
              <a href={stepHref(journeyId, steps, 0)} title={first ? stepLabel(first.screen, first.state) : undefined}>
                Go to its start
              </a>
            </Button>
          </>
        ) : (
          <>
            {back && (
              <Button size="sm" variant="ghost" asChild>
                <a href={stepHref(journeyId, steps, back.from)}>
                  <ArrowLeft /> Back
                </a>
              </Button>
            )}
            <span className="min-w-0 truncate px-2 text-sm">
              {hints.length === 0 ? (
                !skip && next === undefined && <span className="text-muted-foreground">End of {title}</span>
              ) : hints.length === 1 ? (
                <span className={hints[0]?.found ? '' : 'text-destructive'}>
                  {hints[0]?.say}
                  {hints[0]?.found ? '' : ' (control not found)'}
                </span>
              ) : (
                hints.map((h, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground"> or </span>}
                    <Button size="sm" variant="link" className={`h-auto px-1 ${h.found ? '' : 'text-destructive'}`} asChild>
                      <a href={stepHref(journeyId, steps, h.to)}>{h.say}</a>
                    </Button>
                  </span>
                ))
              )}
            </span>
            {skip && (
              <Button size="sm" variant="ghost" asChild>
                <a href={stepHref(journeyId, steps, skip.to)}>
                  Skip <ArrowRight />
                </a>
              </Button>
            )}
            {next !== undefined && (
              <Button size="sm" variant="ghost" asChild>
                <a href={stepHref(journeyId, steps, next)}>
                  Next <ArrowRight />
                </a>
              </Button>
            )}
          </>
        )}
        {!simple && (
          <Toggle size="sm" pressed={guideOn} onPressedChange={setGuideOn} aria-label="Guide" title={guideOn ? 'Guide on' : 'Guide off'}>
            <Sparkles />
          </Toggle>
        )}
      </div>
    </div>
  )
}
