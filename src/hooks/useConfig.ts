import { useEffect, useState, useCallback } from "react"
import { ConfigService, ConfigSpec } from "../services/ConfigService"

export function useConfig<K extends keyof ConfigSpec>(
  key: K,
  defaultValue?: ConfigSpec[K]
): [ConfigSpec[K], (value: ConfigSpec[K]) => Promise<void>, boolean] {
  const [value, setValue] = useState<ConfigSpec[K]>(
    ConfigService.has(key) ? ConfigService.getAll()[key] : (defaultValue as ConfigSpec[K])
  )
  const [loading, setLoading] = useState(!ConfigService.has(key))

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        await ConfigService.initialize()
        const currentValue = ConfigService.getAll()[key]
        if (mounted) {
          setValue(currentValue ?? defaultValue)
          setLoading(false)
        }
      } catch (error) {
        console.error("Failed to load config:", error)
        if (mounted) {
          setValue(defaultValue as ConfigSpec[K])
          setLoading(false)
        }
      }
    }

    init()

    const unsubscribe = ConfigService.onChange((event) => {
      if (event.key === key && mounted) {
        setValue(event.value)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [key, defaultValue])

  const updateValue = useCallback(
    async (newValue: ConfigSpec[K]) => {
      try {
        await ConfigService.set(key, newValue)
        setValue(newValue)
      } catch (error) {
        console.error("Failed to update config:", error)
        throw error
      }
    },
    [key]
  )

  return [value, updateValue, loading]
}

export function useConfigAll(): [ConfigSpec, (key: keyof ConfigSpec, value: any) => Promise<void>] {
  const [config, setConfig] = useState<ConfigSpec>(ConfigService.getAll())

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        await ConfigService.initialize()
        if (mounted) {
          setConfig(ConfigService.getAll())
        }
      } catch (error) {
        console.error("Failed to load config:", error)
      }
    }

    init()

    const unsubscribe = ConfigService.onChange(() => {
      if (mounted) {
        setConfig(ConfigService.getAll())
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const updateConfig = useCallback(async (key: keyof ConfigSpec, value: any) => {
    await ConfigService.set(key, value)
  }, [])

  return [config, updateConfig]
}
