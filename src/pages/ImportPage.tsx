import { ChordsWikiImporter } from '@/components/import/ChordsWikiImporter'
import { ChordProFileImporter } from '@/components/import/ChordProFileImporter'

export default function ImportPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-10">
      <ChordProFileImporter />
      <div className="border-t border-surface-3 pt-8">
        <ChordsWikiImporter />
      </div>
    </div>
  )
}
