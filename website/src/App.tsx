import { Background } from './components/Background'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Features } from './components/Features'
import { Showcase } from './components/Showcase'
import { Stats } from './components/Stats'
import { Download } from './components/Download'
import { Footer } from './components/Footer'

export default function App(): JSX.Element {
  return (
    <div className="relative min-h-screen font-sans text-neutral-200 antialiased">
      <Background />
      <Nav />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <Stats />
        <Download />
      </main>
      <Footer />
    </div>
  )
}
