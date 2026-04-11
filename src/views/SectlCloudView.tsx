/**
 * SECTL 数据同步视图
 * 提供 SecScore 积分数据的云端同步功能
 */

import React from "react"
import { SectlProvider } from "../contexts/SectlContext"
import { SectlSettingsPanel } from "../components/SectlSettingsPanel"

export const ScoreSyncView: React.FC = () => {
  return (
    <SectlProvider>
      <div style={{ padding: 24 }}>
        <SectlSettingsPanel />
      </div>
    </SectlProvider>
  )
}
