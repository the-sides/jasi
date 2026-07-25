import { createFileRoute } from '@tanstack/react-router'
import SceneEditor from '../components/editor/SceneEditor'

export const Route = createFileRoute('/')({
  // Three.js needs the DOM/WebGL — render this route on the client only.
  ssr: false,
  component: SceneEditor,
})
