import { createContext, useContext } from "react"
import { ClientContext } from "../ClientContext"

const ServiceContext = createContext<ClientContext | null>(null)

export const ServiceProvider = ServiceContext.Provider

export const useService = () => {
  const ctx = useContext(ServiceContext)
  if (!ctx) throw new Error("No ServiceProvider")
  return ctx
}
