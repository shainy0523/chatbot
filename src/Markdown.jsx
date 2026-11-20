import { useState, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [
  [rehypeKatex, { throwOnError: false }],
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
]

// Pull plain text out of the (highlighted) React tree so "Copy" gets clean code.
function nodeText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement(node)) return nodeText(node.props.children)
  return ''
}

export function CopyButton({ getText, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (e.g. insecure context) */
    }
  }

  return (
    <button type="button" className={`copy-btn ${className}`} onClick={copy} aria-label={label}>
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          {label}
        </>
      )}
    </button>
  )
}

function CodeBlock({ children }) {
  const codeEl = isValidElement(children) ? children : null
  const className = codeEl?.props?.className ?? ''
  const lang = /language-([\w-]+)/.exec(className)?.[1] ?? 'code'

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{lang}</span>
        <CopyButton getText={() => nodeText(children).replace(/\n$/, '')} />
      </div>
      <pre>{children}</pre>
    </div>
  )
}

const components = {
  pre: CodeBlock,
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener">{children}</a>
  ),
  // wrap tables so wide ones scroll instead of breaking the bubble
  table: ({ children }) => (
    <div className="table-wrap"><table>{children}</table></div>
  ),
}

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
