import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs, Card, Form, Select, Input, Button, Space, Divider, Tag, Modal, message } from 'antd'
import { ThemeQuickSettings } from './ThemeQuickSettings'
import { useTranslation } from 'react-i18next'
import { changeLanguage, getCurrentLanguage, languageOptions, AppLanguage } from '../i18n'

type permissionLevel = 'admin' | 'points' | 'view'
type appSettings = {
  is_wizard_completed: boolean
  log_level: 'debug' | 'info' | 'warn' | 'error'
  window_zoom?: string
  auto_score_enabled?: boolean
}

export const Settings: React.FC<{ permission: permissionLevel }> = ({ permission }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('appearance')
  const [currentLanguage, setCurrentLanguage] = useState<AppLanguage>(getCurrentLanguage())
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

  const [urlRegisterLoading, setUrlRegisterLoading] = useState(false)
  const canAdmin = permission === 'admin'
  const [messageApi, contextHolder] = message.useMessage()

  const [pgConnectionString, setPgConnectionString] = useState('')
  const [pgConnectionStatus, setPgConnectionStatus] = useState<{
    connected: boolean
    type: 'sqlite' | 'postgresql'
    error?: string
  }>({ connected: true, type: 'sqlite' })
  const [pgTestLoading, setPgTestLoading] = useState(false)
  const [pgSwitchLoading, setPgSwitchLoading] = useState(false)

  const permissionTag = useMemo(() => {
    return (
      <Tag
        color={permission === 'admin' ? 'success' : permission === 'points' ? 'warning' : 'default'}
      >
        {permission === 'admin'
          ? t('permissions.admin')
          : permission === 'points'
            ? t('permissions.points')
            : t('permissions.view')}
      </Tag>
    )
  }, [permission, t])

  const emitDataUpdated = (category: 'events' | 'students' | 'reasons' | 'all') => {
    window.dispatchEvent(new CustomEvent('ss:data-updated', { detail: { category } }))
  }

  const loadAll = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.getAllSettings()
    if (res.success && res.data) {
      setSettings(res.data)
      setPgConnectionString(res.data.pg_connection_string || '')
      setPgConnectionStatus(res.data.pg_connection_status || { connected: true, type: 'sqlite' })
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
        if (change?.key === 'auto_score_enabled')
          return { ...prev, auto_score_enabled: change.value }
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
      messageApi.error(res.message || t('settings.data.readLogsFailed'))
      return
    }
    setLogsText((res.data || []).join('\n'))
    setLogsDialogVisible(true)
  }

  const exportLogs = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.queryLogs(5000)
    if (!res.success) {
      messageApi.error(res.message || t('settings.data.readLogsFailed'))
      return
    }
    const dateTime = new Date().toISOString().replace(/[:.]/g, '-')
    downloadTextFile(`secscore_logs_${dateTime}.txt`, `${(res.data || []).join('\n')}\n`)
    messageApi.success(t('settings.data.logsExported'))
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
      messageApi.error(res.message || t('settings.data.exportFailed'))
      return
    }
    const blob = new Blob([res.data], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `secscore_export_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    messageApi.success(t('settings.data.exportSuccess'))
  }

  const importJson = async (file: File) => {
    if (!(window as any).api) return
    const text = await file.text()
    const res = await (window as any).api.importDataJson(text)
    if (res.success) {
      messageApi.success(t('settings.data.importSuccess'))
      setTimeout(() => window.location.reload(), 300)
    } else {
      messageApi.error(res.message || t('settings.data.importFailed'))
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
        showRecoveryDialog(
          t('settings.security.recoveryString') + ` (${t('recovery.hint')})`,
          res.data.recoveryString
        )
      } else {
        messageApi.success(t('settings.security.saved'))
      }
    } else {
      messageApi.error(res.message || t('settings.general.saveFailed'))
    }
  }

  const generateRecovery = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authGenerateRecovery()
    if (!res.success || !res.data?.recoveryString) {
      messageApi.error(res.message || t('settings.security.generateFailed'))
      return
    }
    await loadAll()
    showRecoveryDialog(
      t('settings.security.newRecoveryString', 'New recovery string (please save it)'),
      res.data.recoveryString
    )
  }

  const resetByRecovery = async () => {
    if (!(window as any).api) return
    const res = await (window as any).api.authResetByRecovery(recoveryToReset)
    if (!res.success || !res.data?.recoveryString) {
      messageApi.error(res.message || t('settings.security.resetFailed'))
      return
    }
    setRecoveryToReset('')
    await loadAll()
    showRecoveryDialog(
      t('settings.security.passwordClearedNewRecovery', 'Password cleared, new recovery string'),
      res.data.recoveryString
    )
  }

  const clearAllPasswords = () => {
    setClearDialogVisible(true)
  }

  const handleConfirmClearAll = async () => {
    if (!(window as any).api) return
    setClearLoading(true)
    const res = await (window as any).api.authClearAll()
    setClearLoading(false)
    if (res.success) {
      messageApi.success(t('settings.security.cleared'))
      await loadAll()
      setClearDialogVisible(false)
    } else {
      messageApi.error(res.message || t('settings.security.clearFailed'))
    }
  }

  const confirmSettlement = () => {
    setSettleDialogVisible(true)
  }

  const testPgConnection = async () => {
    if (!(window as any).api) return
    if (!pgConnectionString) {
      messageApi.warning(t('settings.database.enterConnectionString'))
      return
    }
    setPgTestLoading(true)
    try {
      const res = await (window as any).api.dbTestConnection(pgConnectionString)
      if (res.success && res.data?.success) {
        messageApi.success(t('settings.database.connectionTestSuccess'))
      } else {
        messageApi.error(
          res.data?.error || res.message || t('settings.database.connectionTestFailed')
        )
      }
    } catch (e: any) {
      messageApi.error(e?.message || t('settings.database.connectionTestFailed'))
    } finally {
      setPgTestLoading(false)
    }
  }

  const switchToPg = async () => {
    if (!(window as any).api) return
    setPgSwitchLoading(true)
    try {
      const res = await (window as any).api.dbSwitchConnection(pgConnectionString)
      if (res.success) {
        messageApi.success(
          t('settings.database.switchedTo', {
            type: res.data?.type === 'postgresql' ? 'PostgreSQL' : 'SQLite'
          })
        )
        await loadAll()
      } else {
        messageApi.error(res.message || t('settings.database.switchFailed'))
      }
    } catch (e: any) {
      messageApi.error(e?.message || t('settings.database.switchFailed'))
    } finally {
      setPgSwitchLoading(false)
    }
  }

  const switchToSQLite = async () => {
    if (!(window as any).api) return
    setPgSwitchLoading(true)
    try {
      const res = await (window as any).api.dbSwitchConnection('')
      if (res.success) {
        messageApi.success(t('settings.database.switchedToSQLite'))
        setPgConnectionString('')
        await loadAll()
      } else {
        messageApi.error(res.message || t('settings.database.switchFailed'))
      }
    } catch (e: any) {
      messageApi.error(e?.message || t('settings.database.switchFailed'))
    } finally {
      setPgSwitchLoading(false)
    }
  }

  const currentYear = new Date().getFullYear()

  const tabItems = [
    {
      key: 'appearance',
      label: t('settings.tabs.appearance'),
      children: (
        <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
          <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
            <Form.Item label={t('settings.language')}>
              <Select
                value={currentLanguage}
                onChange={async (v: AppLanguage) => {
                  await changeLanguage(v)
                  setCurrentLanguage(v)
                  messageApi.success(t('common.success'))
                }}
                style={{ width: '320px' }}
                options={languageOptions.map((opt) => ({
                  value: opt.value,
                  label: opt.label
                }))}
              />
              <div
                style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}
              >
                {t('settings.languageHint')}
              </div>
            </Form.Item>
          </Form>

          <Divider />

          <ThemeQuickSettings />

          <Divider />

          <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
            <Form.Item label={t('settings.interfaceZoom')}>
              <Select
                value={settings.window_zoom || '1.0'}
                onChange={async (v) => {
                  if (!(window as any).api) return
                  const next = String(v)
                  const res = await (window as any).api.setSetting('window_zoom', next)
                  if (res.success) {
                    setSettings((prev) => ({ ...prev, window_zoom: next }))
                    messageApi.success(t('settings.general.saved'))
                  } else {
                    messageApi.error(res.message || t('settings.general.saveFailed'))
                  }
                }}
                style={{ width: '320px' }}
                disabled={!canAdmin}
                options={[
                  { value: '0.7', label: t('settings.zoomOptions.small70') },
                  { value: '0.8', label: '80%' },
                  { value: '0.9', label: '90%' },
                  { value: '1.0', label: t('settings.zoomOptions.default100') },
                  { value: '1.1', label: '110%' },
                  { value: '1.2', label: '120%' },
                  { value: '1.3', label: '130%' },
                  { value: '1.5', label: t('settings.zoomOptions.large150') }
                ]}
              />
              <div
                style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}
              >
                {t('settings.zoomHint')}
              </div>
            </Form.Item>
          </Form>
        </Card>
      )
    },
    {
      key: 'security',
      label: t('settings.tabs.security'),
      children: (
        <>
          <Card
            style={{
              backgroundColor: 'var(--ss-card-bg)',
              color: 'var(--ss-text-main)',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600 }}>{t('settings.security.title')}</div>
              <Space>
                <Tag color={securityStatus?.hasAdminPassword ? 'success' : 'default'}>
                  {t('settings.security.adminPassword')}{' '}
                  {securityStatus?.hasAdminPassword
                    ? t('settings.security.set')
                    : t('settings.security.notSet')}
                </Tag>
                <Tag color={securityStatus?.hasPointsPassword ? 'success' : 'default'}>
                  {t('settings.security.pointsPassword')}{' '}
                  {securityStatus?.hasPointsPassword
                    ? t('settings.security.set')
                    : t('settings.security.notSet')}
                </Tag>
                <Tag color={securityStatus?.hasRecoveryString ? 'success' : 'default'}>
                  {t('settings.security.recoveryString')}{' '}
                  {securityStatus?.hasRecoveryString
                    ? t('settings.security.generated')
                    : t('settings.security.notGenerated')}
                </Tag>
              </Space>
            </div>

            <Divider />

            <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
              <Form.Item label={t('settings.security.adminPassword')}>
                <Input
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder={t('settings.security.adminPasswordPlaceholder')}
                  maxLength={6}
                  disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                />
              </Form.Item>

              <Form.Item label={t('settings.security.pointsPassword')}>
                <Input
                  value={pointsPassword}
                  onChange={(e) => setPointsPassword(e.target.value)}
                  placeholder={t('settings.security.pointsPasswordPlaceholder')}
                  maxLength={6}
                  disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                />
              </Form.Item>

              <Form.Item label={t('common.operation')}>
                <Space>
                  <Button
                    type="primary"
                    onClick={savePasswords}
                    disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                  >
                    {t('settings.security.savePassword')}
                  </Button>
                  <Button
                    onClick={generateRecovery}
                    disabled={!canAdmin && Boolean(securityStatus?.hasAdminPassword)}
                  >
                    {t('settings.security.generateRecovery')}
                  </Button>
                  <Button danger onClick={clearAllPasswords} disabled={!canAdmin}>
                    {t('settings.security.clearAllPasswords')}
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>
              {t('settings.security.recoveryReset')}
            </div>
            <Space>
              <Input
                value={recoveryToReset}
                onChange={(e) => setRecoveryToReset(e.target.value)}
                placeholder={t('settings.security.recoveryPlaceholder')}
                style={{ width: '420px' }}
              />
              <Button type="primary" onClick={resetByRecovery}>
                {t('settings.security.resetPassword')}
              </Button>
            </Space>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
              {t('settings.security.resetHint')}
            </div>
          </Card>
        </>
      )
    },
    {
      key: 'database',
      label: t('settings.database.title'),
      children: (
        <>
          <Card
            style={{
              backgroundColor: 'var(--ss-card-bg)',
              color: 'var(--ss-text-main)',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>
              {t('settings.database.currentStatus')}
            </div>
            <Space>
              <Tag color={pgConnectionStatus.type === 'postgresql' ? 'blue' : 'green'}>
                {pgConnectionStatus.type === 'postgresql'
                  ? t('settings.database.postgresqlRemote')
                  : t('settings.database.sqliteLocal')}
              </Tag>
              <Tag color={pgConnectionStatus.connected ? 'success' : 'error'}>
                {pgConnectionStatus.connected
                  ? t('settings.database.connected')
                  : t('settings.database.disconnected')}
              </Tag>
              {pgConnectionStatus.error && (
                <span style={{ color: 'var(--ant-color-error, #ff4d4f)', fontSize: '12px' }}>
                  {pgConnectionStatus.error}
                </span>
              )}
            </Space>
          </Card>

          <Card
            style={{
              backgroundColor: 'var(--ss-card-bg)',
              color: 'var(--ss-text-main)',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>
              {t('settings.database.postgresqlConnection')}
            </div>
            <div
              style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}
            >
              {t('settings.database.connectionHint')}
            </div>
            <Space.Compact style={{ width: '100%', marginBottom: '12px' }}>
              <Input
                value={pgConnectionString}
                onChange={(e) => setPgConnectionString(e.target.value)}
                placeholder="postgresql://user:password@host:port/database?sslmode=require"
                style={{ flex: 1 }}
                disabled={!canAdmin}
              />
              <Button
                onClick={testPgConnection}
                loading={pgTestLoading}
                disabled={!canAdmin || !pgConnectionString}
              >
                {t('settings.database.testConnection')}
              </Button>
            </Space.Compact>
            <div
              style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}
            >
              {t('settings.database.connectionExample')}
            </div>
            <Space>
              <Button
                type="primary"
                onClick={switchToPg}
                loading={pgSwitchLoading}
                disabled={!canAdmin || !pgConnectionString}
              >
                {t('settings.database.switchToPostgreSQL')}
              </Button>
              <Button
                onClick={switchToSQLite}
                loading={pgSwitchLoading}
                disabled={!canAdmin || pgConnectionStatus.type === 'sqlite'}
              >
                {t('settings.database.switchToSQLite')}
              </Button>
            </Space>
          </Card>

          <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>
              {t('settings.database.syncDescription')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ss-text-secondary)', lineHeight: '1.8' }}>
              <p>{t('settings.database.syncPoint1')}</p>
              <p>{t('settings.database.syncPoint2')}</p>
              <p>{t('settings.database.syncPoint3')}</p>
              <p>{t('settings.database.syncPoint4')}</p>
            </div>
          </Card>
        </>
      )
    },
    {
      key: 'data',
      label: t('settings.data.title'),
      children: (
        <>
          <Card
            title={t('settings.data.settlement')}
            style={{
              backgroundColor: 'var(--ss-card-bg)',
              color: 'var(--ss-text-main)',
              marginBottom: '16px'
            }}
          >
            <Space align="center">
              <Button
                danger
                disabled={!canAdmin}
                loading={settleLoading}
                onClick={confirmSettlement}
              >
                {t('settings.data.settlementAndRestart')}
              </Button>
              <div style={{ fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
                {t('settings.data.settlementHint')}
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
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>
              {t('settings.data.importExport')}
            </div>
            <Space>
              <Button type="primary" onClick={exportJson}>
                {t('settings.data.exportJson')}
              </Button>
              <Button onClick={() => importInputRef.current?.click()}>
                {t('settings.data.importJson')}
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
              {t('settings.data.importHint')}
            </div>
          </Card>

          <Card
            title={t('settings.data.logs')}
            style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}
          >
            <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
              <Form.Item label={t('settings.data.logLevel')}>
                <Select
                  value={settings.log_level}
                  onChange={async (v) => {
                    if (!(window as any).api) return
                    const next = String(v) as any
                    const res = await (window as any).api.setSetting('log_level', next)
                    if (res.success) {
                      setSettings((prev) => ({ ...prev, log_level: next }))
                      messageApi.success(t('settings.general.saved'))
                    } else {
                      messageApi.error(res.message || '更新失败')
                    }
                  }}
                  style={{ width: '320px' }}
                  options={[
                    { value: 'debug', label: t('settings.data.logLevels.debug') },
                    { value: 'info', label: t('settings.data.logLevels.info') },
                    { value: 'warn', label: t('settings.data.logLevels.warn') },
                    { value: 'error', label: t('settings.data.logLevels.error') }
                  ]}
                />
              </Form.Item>
              <Form.Item label={t('settings.data.logOperation')}>
                <Space>
                  <Button loading={logsLoading} onClick={showLogs}>
                    {t('settings.data.viewLogs')}
                  </Button>
                  <Button onClick={exportLogs}>{t('settings.data.exportLogs')}</Button>
                  <Button
                    danger
                    onClick={async () => {
                      if (!(window as any).api) return
                      const res = await (window as any).api.clearLogs()
                      if (res.success) messageApi.success(t('settings.data.logsCleared'))
                      else messageApi.error(res.message || t('settings.data.clearFailed'))
                    }}
                  >
                    清空日志
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </>
      )
    },
    {
      key: 'url',
      label: t('settings.url.title'),
      children: (
        <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
            {t('settings.url.protocol')}
          </div>
          <Divider />
          <div
            style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--ss-text-secondary)' }}
          >
            {t('settings.url.description')}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '12px',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", monospace'
            }}
          >
            <div>secscore://settings</div>
            <div>secscore://score</div>
          </div>
          <Divider />
          <Space>
            <Button
              type="primary"
              loading={urlRegisterLoading}
              disabled={!canAdmin}
              onClick={async () => {
                if (!(window as any).api) return
                setUrlRegisterLoading(true)
                const res = await (window as any).api.registerUrlProtocol()
                setUrlRegisterLoading(false)
                if (res && res.success) {
                  messageApi.success(t('settings.url.registered'))
                } else {
                  messageApi.error(res?.message || t('settings.url.registerFailed'))
                }
              }}
            >
              {t('settings.url.register')}
            </Button>
          </Space>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ss-text-secondary)' }}>
            {t('settings.url.installerRequired')}
          </div>
        </Card>
      )
    },
    {
      key: 'about',
      label: t('settings.about.title'),
      children: (
        <Card style={{ backgroundColor: 'var(--ss-card-bg)', color: 'var(--ss-text-main)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>SecScore</div>
          <div style={{ color: 'var(--ss-text-secondary)', marginBottom: '16px' }}>
            {t('settings.about.appName')}
          </div>
          <Divider />
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: '10px' }}>
            <div style={{ color: 'var(--ss-text-secondary)' }}>{t('settings.about.version')}</div>
            <div>v1.0.0</div>
            <div style={{ color: 'var(--ss-text-secondary)' }}>{t('settings.about.copyright')}</div>
            <div>{'CopyRight © 2025-' + currentYear + ' SECTL'}</div>
            <div style={{ color: 'var(--ss-text-secondary)' }}>Electron</div>
            <div>{(window as any).electron?.process?.versions?.electron || '-'}</div>
            <div style={{ color: 'var(--ss-text-secondary)' }}>Chromium</div>
            <div>{(window as any).electron?.process?.versions?.chrome || '-'}</div>
            <div style={{ color: 'var(--ss-text-secondary)' }}>Node</div>
            <div>{(window as any).electron?.process?.versions?.node || '-'}</div>
            <div style={{ color: 'var(--ss-text-secondary)' }}>{t('settings.about.ipcStatus')}</div>
            <div>
              <Tag color={(window as any).api ? 'success' : 'error'}>
                {(window as any).api
                  ? t('settings.about.ipcConnected')
                  : t('settings.about.ipcDisconnected')}
              </Tag>
            </div>
            <div style={{ color: 'var(--ss-text-secondary)' }}>
              {t('settings.about.environment')}
            </div>
            <div>
              <Tag>{import.meta.env.DEV ? 'Development' : 'Production'}</Tag>
            </div>
          </div>
          <Divider />
          <div style={{ marginTop: '16px' }}>
            <Button
              onClick={() => {
                ;(window as any).api?.toggleDevTools()
              }}
            >
              {t('settings.about.toggleDevTools')}
            </Button>
          </div>
        </Card>
      )
    }
  ]

  return (
    <div
      style={{
        padding: '24px',
        maxWidth: '900px',
        margin: '0 auto',
        color: 'var(--ss-text-main)'
      }}
    >
      {contextHolder}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}
      >
        <h2 style={{ margin: 0 }}>{t('settings.title')}</h2>
        {permissionTag}
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal
        title={recoveryDialogHeader}
        open={recoveryDialogVisible}
        onCancel={() => setRecoveryDialogVisible(false)}
        footer={
          <Button type="primary" onClick={() => setRecoveryDialogVisible(false)}>
            {t('recovery.saved')}
          </Button>
        }
        width="70%"
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
              type="primary"
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
            {t('recovery.exportHint')}
          </div>
        </div>
      </Modal>

      <Modal
        title={t('settings.data.systemLogs')}
        open={logsDialogVisible}
        onCancel={() => setLogsDialogVisible(false)}
        footer={<Button onClick={() => setLogsDialogVisible(false)}>{t('common.close')}</Button>}
        width="80%"
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
          {logsText || t('settings.data.noLogs')}
        </div>
      </Modal>

      <Modal
        title={t('settings.data.confirmSettlement')}
        open={settleDialogVisible}
        onCancel={() => !settleLoading && setSettleDialogVisible(false)}
        onOk={async () => {
          if (!(window as any).api) return
          setSettleLoading(true)
          const res = await (window as any).api.createSettlement()
          setSettleLoading(false)
          if (res.success && res.data) {
            messageApi.success(t('settings.data.settlementSuccess'))
            emitDataUpdated('all')
            setSettleDialogVisible(false)
          } else {
            messageApi.error(res.message || t('settings.data.settlementFailed'))
          }
        }}
        confirmLoading={settleLoading}
        okText={t('settings.data.settle')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>{t('settings.data.settlementConfirm1')}</div>
          <div style={{ color: 'var(--ss-text-secondary)', fontSize: '12px' }}>
            {t('settings.data.settlementConfirm2')}
          </div>
        </div>
      </Modal>

      <Modal
        title="确认清空所有密码？"
        open={clearDialogVisible}
        onCancel={() => !clearLoading && setClearDialogVisible(false)}
        onOk={handleConfirmClearAll}
        confirmLoading={clearLoading}
        okText="确认清空"
        okButtonProps={{ danger: true }}
      >
        清空后将关闭保护（无密码时默认视为管理权限）。
      </Modal>
    </div>
  )
}
