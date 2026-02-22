import { useEffect } from 'react'

import Prism from 'prismjs'
import { useTheme } from '../contexts/ThemeContext'

import 'prismjs/themes/prism-okaidia.min.css'

const Code = ({ code, language }) => {
  const { currentTheme } = useTheme()

  useEffect(() => {
    // 重新高亮代码
    Prism.highlightAll()
  }, [currentTheme, code, language])

  // 根据主题设置不同的类名
  const isDark = currentTheme?.mode === 'dark'

  return (
    <div
      style={{
        opacity: '0.6',
        // 根据主题动态设置样式
        backgroundColor: isDark ? '#282c34' : '#f5f2f0',
        color: isDark ? '#abb2bf' : '#383a42',
        padding: '16px',
        borderRadius: '8px',
        overflow: 'auto'
      }}
    >
      <pre className={isDark ? 'prism-okaidia' : 'prism-coy'}>
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  )
}

export default Code
