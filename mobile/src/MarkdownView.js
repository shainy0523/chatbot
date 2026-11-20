import { useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Markdown from 'react-native-markdown-display'
import * as Clipboard from 'expo-clipboard'

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

export function CopyButton({ text, c, label = 'Copy', style, color }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await Clipboard.setStringAsync(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Pressable onPress={copy} hitSlop={8} style={[styles.copyBtn, style]} accessibilityLabel={label}>
      <Text style={{ color: color ?? c.muted, fontSize: 12, fontWeight: '600' }}>
        {copied ? '✓ Copied' : `⧉ ${label}`}
      </Text>
    </Pressable>
  )
}

function CodeBlock({ code, lang, c }) {
  const clean = code.replace(/\n$/, '')
  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHead}>
        <Text style={[styles.codeLang, { fontFamily: MONO }]}>{lang || 'code'}</Text>
        <CopyButton text={clean} c={c} color="#8b949e" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable style={[styles.codeText, { fontFamily: MONO }]}>
          {clean}
        </Text>
      </ScrollView>
    </View>
  )
}

export default function MarkdownView({ children, c }) {
  const mdStyles = {
    body: { color: c.text, fontSize: 15, lineHeight: 23 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    heading1: { fontSize: 21, fontWeight: '700', marginTop: 10, marginBottom: 6, color: c.text },
    heading2: { fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 6, color: c.text },
    heading3: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 4, color: c.text },
    strong: { fontWeight: '700' },
    link: { color: c.accent, textDecorationLine: 'underline' },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    list_item: { marginVertical: 2 },
    code_inline: {
      fontFamily: MONO,
      fontSize: 13.5,
      color: c.accent,
      backgroundColor: c.accentSoft,
      borderRadius: 5,
      paddingHorizontal: 4,
    },
    blockquote: {
      backgroundColor: 'transparent',
      borderLeftColor: c.accent,
      borderLeftWidth: 3,
      paddingHorizontal: 10,
      marginLeft: 0,
    },
    hr: { backgroundColor: c.border, height: 1, marginVertical: 10 },
    table: { borderColor: c.border, borderRadius: 8, marginBottom: 10 },
    thead: { backgroundColor: c.surface2 },
    th: { padding: 8, fontWeight: '700', borderColor: c.border },
    td: { padding: 8, borderColor: c.border },
    tr: { borderColor: c.border },
  }

  const rules = {
    fence: (node) => <CodeBlock key={node.key} code={node.content} lang={node.sourceInfo} c={c} />,
    code_block: (node) => <CodeBlock key={node.key} code={node.content} lang="" c={c} />,
  }

  return (
    <Markdown style={mdStyles} rules={rules}>
      {children}
    </Markdown>
  )
}

const styles = StyleSheet.create({
  copyBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  codeBlock: {
    backgroundColor: '#0d1117',
    borderColor: '#262b36',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
  },
  codeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 2,
    backgroundColor: '#161b22',
    borderBottomColor: '#262b36',
    borderBottomWidth: 1,
  },
  codeLang: { color: '#8b949e', fontSize: 12 },
  codeText: { color: '#e6edf3', fontSize: 13, lineHeight: 20, padding: 14 },
})
