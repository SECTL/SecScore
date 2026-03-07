import React, { useState } from 'react'
import { Modal, message, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { ThemeQuickSettings } from './ThemeQuickSettings'

interface wizardProps {
  visible: boolean
  onComplete: () => void
}

export const Wizard: React.FC<wizardProps> = ({ visible, onComplete }) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const handleFinish = async () => {
    setLoading(true)
    try {
      if (!(window as any).api) throw new Error('api not ready')
      const res = await (window as any).api.setSetting('is_wizard_completed', true)
      if (!res?.success) throw new Error(res?.message || 'failed')

      messageApi.success(t('wizard.configComplete'))
      onComplete()
    } catch {
      messageApi.error(t('wizard.configFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={t('wizard.welcomeTitle')}
      open={visible}
      onOk={handleFinish}
      onCancel={() => {}}
      confirmLoading={loading}
      okText={t('wizard.startJourney')}
      cancelButtonProps={{ style: { display: 'none' } }}
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      width={500}
    >
      {contextHolder}
      <Typography.Paragraph style={{ marginBottom: '24px', color: 'var(--ss-text-secondary)' }}>
        {t('wizard.welcomeDesc')}
      </Typography.Paragraph>

      <ThemeQuickSettings compact />
    </Modal>
  )
}
