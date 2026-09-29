// docs/design/client-view.md §5: the stories page — the entry screen when a round has more than
// one journey. A storyboard too: the progress line and its segmented bar, then up to three
// sections (Needs you, Not read yet, Confirmed), each a list (phone) or grid (desktop) of story
// tiles. A tile shows the story's first four frames, its title, its actor and one status line;
// a story's variants are indented rows inside its tile.
import type { ServerJourney, ServerState } from '../../schemas/patches.js'
import { roundOf } from '../sync/walkthrough.js'
import { Thumb } from './ClientFrame.js'
import { Check, PhoneBar } from './parts.js'
import {
  SECTIONS,
  actorOf,
  confirmationOf,
  mostUrgent,
  numberedNotes,
  plural,
  stepsOf,
  storyGroups,
  storyStatus,
  widthsOf,
  type NumberedNote,
  type Section,
  type StoryGroup,
  type StoryStatus,
} from './model.js'
import { clientHref } from './route.js'

/** Sub-group each section by actor only past this many main stories (and with 2+ actors). */
const SUBGROUP_ABOVE = 6
const STRIP = 4

function Status({ status }: { status: StoryStatus }) {
  return (
    <span className="cv-status">
      {status.mark === 'dot' && <span className="cv-dot" aria-hidden />}
      {status.mark === 'check' && <Check />}
      {status.words}
    </span>
  )
}

function hrefFor(journey: ServerJourney, status: StoryStatus): string {
  return clientHref(status.confirmed ? { kind: 'story', journey: journey.id } : { kind: 'step', journey: journey.id, step: 1 })
}

type Tile = StoryGroup & { section: Section; status: StoryStatus; variantStatus: StoryStatus[] }

function StoryTile({ tile, data, round, width }: { tile: Tile; data: ServerState; round: number | null; width: number }) {
  const { main, variants, status } = tile
  const actor = actorOf(main)
  // the strip crops each frame to 4:3 from the top of the screen
  const height = Math.round((width * 3) / 4)
  const strip = stepsOf(main, data).slice(0, STRIP)
  return (
    <li className="cv-tile">
      <a className="cv-tile-main" href={hrefFor(main, status)} data-journey={main.id}>
        {strip.length > 0 && (
          <span className="cv-strip">
            {strip.map((s) => (
              <Thumb key={s.index} round={round} width={width} height={height} screen={s.screen} state={s.state} lazy />
            ))}
          </span>
        )}
        <span className="cv-tile-title">{main.title}</span>
        {actor && <span className="cv-tile-actor">{actor}</span>}
        <Status status={status} />
      </a>
      {variants.length > 0 && (
        <ul className="cv-variants">
          {variants.map((v, i) => {
            const vs = tile.variantStatus[i] as StoryStatus
            return (
              <li key={v.id}>
                <a className="cv-variant" href={hrefFor(v, vs)} data-journey={v.id}>
                  <span className="cv-variant-title">{v.title}</span>
                  <Status status={vs} />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

export function StoriesPage({ data, project }: { data: ServerState; project: string }) {
  const round = roundOf(data)?.n ?? null
  // strips draw the phone width at every size: at 64–110 px a desktop frame is too small to read
  const width = widthsOf(data).phone
  const all: NumberedNote[] = numberedNotes(data)

  const tiles: Tile[] = storyGroups(data.journeys).map((g) => {
    const status = storyStatus(g.main, data, all)
    const variantStatus = g.variants.map((v) => storyStatus(v, data, all))
    return { ...g, status, variantStatus, section: mostUrgent([status.section, ...variantStatus.map((s) => s.section)]) }
  })

  // the progress counts main stories and variants alike, each confirmed on its own
  const total = data.journeys.length
  const done = data.journeys.filter((j) => {
    const c = confirmationOf(j, data.approval)
    return c !== null && !c.stale
  }).length

  const actors: string[] = []
  for (const t of tiles) {
    const a = actorOf(t.main)
    if (a !== null && !actors.includes(a)) actors.push(a)
  }
  const subgroup = actors.length > 1 && tiles.length > SUBGROUP_ABOVE

  const tileList = (list: Tile[]) => (
    <ul className="cv-tiles">
      {list.map((t) => (
        <StoryTile key={t.main.id} tile={t} data={data} round={round} width={width} />
      ))}
    </ul>
  )

  return (
    <div className="cv cv-page cv-stories-page">
      <PhoneBar project={project} projectHref={null} position={null} total={0} done={0} always />
      <main className="cv-stories cv-on-slate">
        <div className="cv-tally">
          <h1 className="cv-tally-line">{`${done} of ${plural(total, 'story', 'stories')} confirmed`}</h1>
          <div className="cv-tally-bar" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < done ? 'is-done' : ''} />
            ))}
          </div>
        </div>
        {SECTIONS.map(({ id, title }) => {
          const list = tiles.filter((t) => t.section === id)
          if (list.length === 0) return null
          const byActor = subgroup
            ? [...actors.map((a) => ({ actor: a as string | null, list: list.filter((t) => actorOf(t.main) === a) })), { actor: null, list: list.filter((t) => actorOf(t.main) === null) }].filter(
                (g) => g.list.length > 0,
              )
            : null
          return (
            <section key={id} className="cv-section" aria-labelledby={`cv-section-${id}`}>
              <h2 id={`cv-section-${id}`} className="cv-section-title">
                {title}
              </h2>
              {byActor
                ? byActor.map((g) => (
                    <div key={g.actor ?? ''} className="cv-actor-group">
                      {g.actor && <p className="cv-actor-line">{g.actor}</p>}
                      {tileList(g.list)}
                    </div>
                  ))
                : tileList(list)}
            </section>
          )
        })}
      </main>
    </div>
  )
}
