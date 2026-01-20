import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Tabs,
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  Divider,
  Tag,
  Dialog,
  MessagePlugin
} from 'tdesign-react'
import { useTheme } from '../contexts/ThemeContext'
import { useThemeEditor } from '../contexts/ThemeEditorContext'

type permissionLevel = 'admin' | 'points' | 'view'
type appSettings = {
  is_wizard_completed: boolean
  log_level: 'debug' | 'info' | 'warn' | 'error'
  window_zoom?: string
}

export const Settings: React.FC<{ permission: permissionLevel }> = ({ permission }) => {
  const { themes, currentTheme, setTheme } = useTheme()
  const { startEditing } = useThemeEditor()
  const [activeTab, setActiveTab] = useState('appearance')
  const [settings, setSettings] = useState<appSettings>({
    is_wizard_completed: false,
    log_level: 'info',
    window_zoom: '1.0'
  })

  const [securityStatus, setSecurityStatus] = useState<{
    permission: permissionLevel
    hasAdminPassword: boolean
    hasPointsPassword: boolean
    hasRecoveryString: boolean
  } | null>(null)

  const [adminPassword, setAdminPassword] = useState('')
  const [pointsPassword, setPointsPassword] = useState('')
  const [recoveryToReset, setRecoveryToReset] = useState('')

  const [recoveryDialogVisible, setRecoveryDialogVisible] = useState(false)
  const [recoveryDialogHeader, setRecoveryDialogHeader] = useState('')
  const [recoveryDialogString, setRecoveryDialogString] = useState('')
  const [recoveryDialogFilename, setRecoveryDialogFilename] = useState('')

  const [logsDialogVisible, setLogsDialogVisible] = useState(false)
  const [logsText, setLogsText] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)

  const [clearDialogVisible, setClearDialogVisible] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [settleLoading, setSettleLoading] = useState(false)
  const [settleDialogVisible, setSettleDialogVisible] = useState(false)

  const canAdmin = permission === 'admin'

  const permissionTag = useMemo(() => {
    return (
      <Tag
        theme={permission === 'admin' ? 'success' : permission === 'points' ? 'warning' : 'default'}
        variant="light"
      >
        {permission === 'admin' ? '管理权限' : permission === 'points' ? '积分权限' : '只读'}
      </Tag>
    )
  }, [permission])

  const emitDataUpdated = (category: 'events' | 'students' | 'reasons' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const loadAll = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.getAllSettings()
    if (res.success && res.data) {
      setSettings(res.data)
    }
    const authRes = await (window as any).api.authGetStatus()
    if (authRes.success && authRes.data) setSecurityStatus(authRes.data)
  }

  useEffect(() => {
    loadAll()
    if (!(window as any).api) return
    const unsubscribe = (window as any).api.onSettingChanged((change: any) => {
      setSettings((prev) => {
        if (change?.key === 'log_level') return { ...prev, log_level: change.value }
        if (change?.key === 'is_wizard_completed')
          return { ...prev, is_wizard_completed: change.value }
        if (change?.key === 'window_zoom') return { ...prev, window_zoom: change.value }
        return prev
      })
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  const showLogs = async () => {
    if (!(window as any).api) return
    setLogsLoading(true)
    const res = await (window as any).api.queryLogs(200)
    setLogsLoading(false)
    if (!res.success) {
      MessagePlugin.error(res.message || '读取日志失败')
      return
    }
    setLogsText((res.data || []).join('\n'))
    setLogsDialogVisible(true)
  }

  const exportLogs = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.queryLogs(5000)
    if (!res.success) {
      MessagePlugin.error(res.message || '读取日志失败')
      return
    }
    const dateTime = new Date().toISOString().replace(/[:.]/g, '-')
    downloadTextFile(`secscore_logs_${dateTime}.txt`, `${(res.data || []).join('\n')}\n`)
    MessagePlugin.success('日志已导出')
  }

  const downloadTextFile = (filename: string, text: string) => {
    const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const showRecoveryDialog = (header: string, recoveryString: string) => {
    const date = new Date().toISOString().slice(0, 10)
    const filename = `secscore_recovery_${date}.txt`
    setRecoveryDialogHeader(header)
    setRecoveryDialogString(recoveryString)
    setRecoveryDialogFilename(filename)
    setRecoveryDialogVisible(true)
  }

  const exportJson = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.exportDataJson()
    if (!res.success || !res.data) {
      MessagePlugin.error(res.message || '导出失败')
      return
    }
    const blob = new Blob([res.data], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `secscore_export_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    MessagePlugin.success('导出成功')
  }

  const importJson = async (file: File) => {
    if (!(window as any).api) return
    const text = await file.text()
    const res = await (window as any).api.importDataJson(text)
    if (res.success) {
      MessagePlugin.success('导入成功，正在刷新')
      setTimeout(() => window.location.reload(), 300)
    } else {
      MessagePlugin.error(res.message || '导入失败')
    }
  }

  const savePasswords = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authSetPasswords({
      adminPassword: adminPassword ? adminPassword : undefined,
      pointsPassword: pointsPassword ? pointsPassword : undefined
    })
    if (res.success) {
      setAdminPassword('')
      setPointsPassword('')
      await loadAll()
      if (res.data?.recoveryString) {
        showRecoveryDialog('找回字符串（请妥善保存）', res.data.recoveryString)
      } else {
        MessagePlugin.success('密码已更新')
      }
    } else {
      MessagePlugin.error(res.message || '更新失败')
    }
  }

  const generateRecovery = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authGenerateRecovery()
    if (!res.success || !res.data?.recoveryString) {
      MessagePlugin.error(res.message || '生成失败')
      return
    }
    await loadAll()
    showRecoveryDialog('新的找回字符串（请妥善保存）', res.data.recoveryString)
  }

  const resetByRecovery = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authResetByRecovery(recoveryToReset)
    if (!res.success || !res.data?.recoveryString) {
      MessagePlugin.error(res.message || '重置失败')
      return
    }
    setRecoveryToReset('')
    await loadAll()
    showRecoveryDialog('密码已清空，新的找回字符串', res.data.recoveryString)
  }

  const clearAllPasswords = () => {
    if (!(window as any).api) return
    setClearDialogVisible(true)
  }

  const handleConfirmClearAll = async () => {
    if (!(window as any).api) return
    setClearLoading(true)
    const res = await (window as any).api.authClearAll()
    setClearLoading(false)
    if (res.success) {
      MessagePlugin.success('已清空')
      await loadAll()
      setClearDialogVisible(false)
    } else {
      MessagePlugin.error(res.message || '清空失败')
    }
  }

  const confirmSettlement = () => {
    if (!(window as any).api) return
    setSettleDialogVisible(true)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--ss-text-main)' }}>系统设置</h2>
        {permissionTag}
      </div>

      <Tabs value={activeTab} onChange={(v) => setActiveTab(v as string)}>
        <Tabs.TabPanel value="appearance" label="外观">
          <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
            <Form labelWidth={120}>
              <Form.FormItem label="当前主题">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Select
                    value={currentTheme?.id}
                    onChange={(v) => setTheme(v as string)}
                    style={{ width: '200px' }}
                  >
                    {themes.map((t) => (
                      <Select.Option key={t.id} value={t.id} label={t.name} />
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    theme="default"
                    onClick={() => startEditing(currentTheme || undefined)}
                  >
                    编辑
                  </Button>
                  <Button variant="text" theme="primary" onClick={() => startEditing()}>
                    新建主题
                  </Button>
                </div>
              </Form.FormItem>

              <Form.FormItem label="界面缩放">
                <Select
                  value={settings.window_zoom || '1.0'}
                  onChange={async (v) => {
                    if (!(window as any).api) return
                    const next = String(v)
                    const res = await (window as any).api.setSetting('window_zoom', next)
                    if (res.success) {
                      setSettings((prev) => ({ ...prev, window_zoom: next }))
                      MessagePlugin.success('界面缩放已更新')
                    } else {
                      MessagePlugin.error(res.message || '更新失败')
                    }
                  }}
                  style={{ width: '320px' }}
                  disabled={!canAdmin}
                >
                  <Select.Option value="0.7" label="70% (较小)" />
                  <Select.Option value="0.8" label="80%" />
                  <Select.Option value="0.9" label="90%" />
                  <Select.Option value="1.0" label="100% (默认)" />
                  <Select.Option value="1.1" label="110%" />
                  <Select.Option value="1.2" label="120%" />
                  <Select.Option value="1.3" label="130%" />
                  <Select.Option value="1.5" label="150% (较大)" />
                </Select>
                <div
                  style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}
                >
                  调节应用界面的整体大小。
                </div>
              </Form.FormItem>
            </Form>
          </Card>
        </Tabs.TabPanel>

        <Tabs.TabPanel value="security" label="安全">
          <Card
            style={{
              backgroundColor: 'var(--ss-card-bg)',
              color: 'var(--ss-text-main)',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600 }}>密码保护系统</div>
              <Space>
                <Tag
                  theme={securityStatus?.hasAdminPassword ? 'success' : 'default'}
                  variant="light"
                >
                  管理密码 {securityStatus?.hasAdminPassword ? '已设置' : '未设置'}
                </Tag>
                <Tag
                  theme={securityStatus?.hasPointsPassword ? 'success' : 'default'}
                  variant="light"
                >
                  积分密码 {securityStatus?.hasPointsPassword ? '已设置' : '未设置'}
                </Tag>
                <Tag
                  theme={securityStatus?.hasRecoveryString ? 'success' : 'default'}
                  variant="light"
                >
                  找回字符串 {securityStatus?.hasRecoveryString ? '已生成' : '未生成'}
                </Tag>
              </Space>
            </div>

            <Divider />

            <Form labelWidth={120}>
              <Form.FormItem label="管理密码">
                <Input
                  value={adminPassword}
                  onChange={(v) => setAdminPassword(v)}
                  placeholder="输入6位数字（留空则不修改）"
                  maxlength={6}
                  disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                />
              </Form.FormItem>

              <Form.FormItem label="积分密码">
                <Input
                  value={pointsPassword}
                  onChange={(v) => setPointsPassword(v)}
                  placeholder="输入6位数字（留空则不修改）"
                  maxlength={6}
                  disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                />
              </Form.FormItem>

              <Form.FormItem label="操作">
                <Space>
                  <Button
                    theme="primary"
                    onClick={savePasswords}
                    disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                  >
                    保存密码
                  </Button>
                  <Button
                    variant="outline"
                    onClick={generateRecovery}
                    disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                  >
                    生成找回字符串
                  </Button>
                  <Button
                    theme="danger"
                    variant="outline"
                    onClick={clearAllPasswords}
                    disabled={!canAdmin}
                  >
                    清空所有密码
                  </Button>
                </Space>
              </Form.FormItem>
            </Form>
          </Card>

          <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>找回字符串重置</div>
            <Space>
              <Input
                value={recoveryToReset}
                onChange={(v) => setRecoveryToReset(v)}
                placeholder="输入找回字符串"
                style={{ width: '420px' }}
              />
              <Button theme="primary" variant="outline" onClick={resetByRecovery}>
                重置密码
              </Button>
            </Space>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
              重置会清空管理/积分密码，并生成新的找回字符串。
            </div>
          </Card>
        </Tabs.TabPanel>

        <Tabs.TabPanel value="data" label="数据管理">
          <Card
            title="结算"
            style={{
              backgroundColor: 'var(--ss-card-bg)',
              color: 'var(--ss-text-main)',
              marginBottom: '16px'
            }}
          >
            <Space align="center">
              <Button
                theme="danger"
                variant="outline"
                disabled={!canAdmin}
                loading={settleLoading}
                onClick={confirmSettlement}
              >
                结算并重新开始
              </Button>
              <div style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
                将当前未结算记录划分为一个阶段，并将所有学生积分清零。
              </div>
            </Space>
          </Card>

          <Card
            style={{
              backgroundColor: 'var(--ss-card-bg)',
              color: 'var(--ss-text-main)',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>导入 / 导出</div>
            <Space>
              <Button theme="primary" onClick={exportJson}>
                导出 JSON
              </Button>
              <Button variant="outline" onClick={() => importInputRef.current?.click()}>
                导入 JSON
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) importJson(file)
                  if (importInputRef.current) importInputRef.current.value = ''
                }}
              />
            </Space>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
              导入会覆盖现有学生/理由/积分记录/设置（安全相关设置不会导入）。
            </div>
          </Card>

          <Card
            title="日志"
            style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
          >
            <Form labelWidth={120}>
              <Form.FormItem label="日志级别">
                <Select
                  value={settings.log_level}
                  onChange={async (v) => {
                    if (!(window as any).api) return
                    const next = String(v) as any
                    const res = await (window as any).api.setSetting('log_level', next)
                    if (res.success) {
                      setSettings((prev) => ({ ...prev, log_level: next }))
                      MessagePlugin.success('日志级别已更新')
                    } else {
                      MessagePlugin.error(res.message || '更新失败')
                    }
                  }}
                  style={{ width: '320px' }}
                >
                  <Select.Option value="debug" label="DEBUG (调试)" />
                  <Select.Option value="info" label="INFO (信息)" />
                  <Select.Option value="warn" label="WARN (警告)" />
                  <Select.Option value="error" label="ERROR (错误)" />
                </Select>
              </Form.FormItem>
              <Form.FormItem label="日志操作">
                <Space>
                  <Button variant="outline" loading={logsLoading} onClick={showLogs}>
                    查看日志
                  </Button>
                  <Button variant="outline" onClick={exportLogs}>
                    导出日志
                  </Button>
                  <Button
                    theme="danger"
                    variant="outline"
                    onClick={async () => {
                      if (!(window as any).api) return
                      const res = await (window as any).api.clearLogs()
                      if (res.success) MessagePlugin.success('日志已清空')
                      else MessagePlugin.error(res.message || '清空失败')
                    }}
                  >
                    清空日志
                  </Button>
                </Space>
              </Form.FormItem>
            </Form>
          </Card>
        </Tabs.TabPanel>

        <Tabs.TabPanel value="about" label="关于">
          <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>SecScore</div>
            <div style={{ color: 'var(--ss-text-secondary)', marginBottom: '16px' }}>
              教育积分管理
            </div>
            <Divider />
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: '10px' }}>
              <div style={{ color: 'var(--ss-text-secondary)' }}>版本</div>
              <div>v1.0.0</div>
              <div style={{ color: 'var(--ss-text-secondary)' }}>Electron</div>
              <div>{(window as any).electron?.process?.versions?.electron || '-'}</div>
              <div style={{ color: 'var(--ss-text-secondary)' }}>Chromium</div>
              <div>{(window as any).electron?.process?.versions?.chrome || '-'}</div>
              <div style={{ color: 'var(--ss-text-secondary)' }}>Node</div>
              <div>{(window as any).electron?.process?.versions?.node || '-'}</div>
              <div style={{ color: 'var(--ss-text-secondary)' }}>IPC 状态</div>
              <div>
                <Tag
                  theme={(window as any).api ? 'success' : 'danger'}
                  variant="light"
                  size="small"
                >
                  {(window as any).api ? '已连接' : '未连接 (Preload 失败)'}
                </Tag>
              </div>
              <div style={{ color: 'var(--ss-text-secondary)' }}>环境</div>
              <div>
                <Tag variant="outline" size="small">
                  {import.meta.env.DEV ? 'Development' : 'Production'}
                </Tag>
              </div>
            </div>
            <Divider />
            <div style={{ marginTop: '16px' }}>
              <Button
                variant="outline"
                onClick={() => {
                  ;(window as any).api?.toggleDevTools()
                }}
              >
                切换开发者工具
              </Button>
            </div>
          </Card>
        </Tabs.TabPanel>
      </Tabs>

      <Dialog
        header={recoveryDialogHeader}
        visible={recoveryDialogVisible}
        width="70%"
        cancelBtn={null}
        confirmBtn="我已保存"
        onClose={() => setRecoveryDialogVisible(false)}
        onConfirm={() => setRecoveryDialogVisible(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              wordBreak: 'break-all',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", monospace'
            }}
          >
            {recoveryDialogString}
          </div>
          <Space>
            <Button
              theme="primary"
              onClick={() =>
                downloadTextFile(
                  recoveryDialogFilename ||
                    `secscore_recovery_${new Date().toISOString().slice(0, 10)}.txt`,
                  `SecScore 找回字符串: ${recoveryDialogString}\n`
                )
              }
            >
              导出文本文件
            </Button>
          </Space>
          <div style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
            建议导出后离线保存，遗失将无法找回。
          </div>
        </div>
      </Dialog>

      <Dialog
        header="系统日志 (最后200条)"
        visible={logsDialogVisible}
        width="80%"
        cancelBtn={null}
        confirmBtn="关闭"
        onClose={() => setLogsDialogVisible(false)}
        onConfirm={() => setLogsDialogVisible(false)}
      >
        <div
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            fontSize: '12px',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", monospace',
            whiteSpace: 'pre-wrap',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '10px'
          }}
        >
          {logsText || '暂无日志'}
        </div>
      </Dialog>

      <Dialog
        header="确认结算并重新开始？"
        visible={settleDialogVisible}
        confirmBtn="结算"
        confirmLoading={settleLoading}
        onClose={() => {
          if (!settleLoading) setSettleDialogVisible(false)
        }}
        onCancel={() => {
          if (!settleLoading) setSettleDialogVisible(false)
        }}
        onConfirm={async () => {
          if (!(window as any).api) return
          setSettleLoading(true)
          const res = await (window as any).api.createSettlement()
          setSettleLoading(false)
          if (res.success && res.data) {
            MessagePlugin.success('结算成功，已重新开始积分')
            emitDataUpdated('all')
            setSettleDialogVisible(false)
          } else {
            MessagePlugin.error(res.message || '结算失败')
          }
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>将把当前未结算的积分记录归档为一个阶段，并将所有学生当前积分清零。</div>
          <div style={{ color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
            学生名单不变；结算后的历史在“结算历史”页面查看。
          </div>
        </div>
      </Dialog>

      <Dialog
        header="确认清空所有密码？"
        visible={clearDialogVisible}
        confirmBtn="确认清空"
        confirmLoading={clearLoading}
        onClose={() => {
          if (!clearLoading) setClearDialogVisible(false)
        }}
        onCancel={() => {
          if (!clearLoading) setClearDialogVisible(false)
        }}
        onConfirm={handleConfirmClearAll}
      >
        清空后将关闭保护（无密码时默认视为管理权限）。
      </Dialog>
    </div>
  )
}
