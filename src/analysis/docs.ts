import { readFileSync } from 'node:fs'
import ts from 'typescript'
import type { Finding } from '../schemas/index.js'

function isExported(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false
  return ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function hasLeadingJsDoc(fullText: string, node: ts.Node): boolean {
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart())
  return ranges?.some((r) => fullText.slice(r.pos, r.pos + 3) === '/**') ?? false
}

/**
 * D5 `doc` findings: a component or shell file is checked for (a) a `/** ... *\/` JSDoc comment
 * immediately above its main exported declaration (the first exported function/const that is not
 * named `meta` or `examples`), and (b) a named export `examples`. Each missing piece is its own
 * finding.
 */
export function docFindings(files: { file: string; abs: string }[]): Finding[] {
  const findings: Finding[] = []

  for (const target of files) {
    const text = readFileSync(target.abs, 'utf8')
    const sourceFile = ts.createSourceFile(target.abs, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    let foundMainExport = false
    let hasDoc = false
    let hasExamples = false

    sourceFile.forEachChild((node) => {
      if (ts.isFunctionDeclaration(node) && isExported(node)) {
        if (!foundMainExport) {
          foundMainExport = true
          hasDoc = hasLeadingJsDoc(text, node)
        }
        return
      }

      if (ts.isVariableStatement(node) && isExported(node)) {
        const decl = node.declarationList.declarations[0]
        if (decl && ts.isIdentifier(decl.name)) {
          if (decl.name.text === 'examples') {
            hasExamples = true
            return
          }
          if (decl.name.text === 'meta') return
          if (!foundMainExport) {
            foundMainExport = true
            hasDoc = hasLeadingJsDoc(text, node)
          }
        }
      }
    })

    if (!hasDoc) findings.push({ kind: 'doc', severity: 'error', file: target.file, message: 'missing doc line' })
    if (!hasExamples) {
      findings.push({ kind: 'doc', severity: 'error', file: target.file, message: 'missing examples export' })
    }
  }

  return findings
}
