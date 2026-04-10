/**
 * SECTL 登录按钮组件
 */

import React, { useState } from "react"
import { Button, message } from "antd"
import { LoginOutlined, UserOutlined } from "@ant-design/icons"
import { useSectl } from "../contexts/SectlContext"

interface SectlLoginButtonProps {
  onLoginSuccess?: () => void
  onLogoutSuccess?: () => void
  scope?: string[]
}

export const SectlLoginButton: React.FC<SectlLoginButtonProps> = ({
  onLoginSuccess,
  onLogoutSuccess,
  scope = ["user:read", "cloud:read", "cloud:write"],
}) => {
  const { isAuthenticated, isLoading, userInfo, login, logout } = useSectl()
  const [isLogging, setIsLogging] = useState(false)

  const handleLogin = async () => {
    try {
      setIsLogging(true)
      await login(scope)
      message.success("登录成功！")
      onLoginSuccess?.()
    } catch (error: any) {
      message.error(`登录失败：${error.message}`)
    } finally {
      setIsLogging(false)
    }
  }

  const handleLogout = async () => {
    try {
      setIsLogging(true)
      await logout()
      message.success("已退出登录")
      onLogoutSuccess?.()
    } catch (error: any) {
      message.error(`登出失败：${error.message}`)
    } finally {
      setIsLogging(false)
    }
  }

  if (isLoading) {
    return <Button loading>加载中...</Button>
  }

  if (isAuthenticated) {
    return (
      <Button icon={<UserOutlined />} onClick={handleLogout} loading={isLogging} danger>
        {userInfo?.name || "退出登录"}
      </Button>
    )
  }

  return (
    <Button type="primary" icon={<LoginOutlined />} onClick={handleLogin} loading={isLogging}>
      使用 SECTL 登录
    </Button>
  )
}
