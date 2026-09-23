import { cn } from '@/lib/utils'
import { tilt } from '@/lib/tilt'

// Lists use square crops; the big one on a profile shows the whole 4:5 photo.
const SIZES = { sm: 'size-11', md: 'size-16', lg: 'aspect-[4/5] w-28' } as const

type PolaroidProps = {
  /** Stable id (e.g. the person's), so the tilt stays the same. */
  seed: string
  photoUrl?: string | null
  /** Alt text for the photo. Leave empty when the name is already next to it. */
  alt?: string
  size?: keyof typeof SIZES
  /** The name written under the photo (not shown at the smallest size). */
  caption?: string
  className?: string
}

/** A person's photo in a slightly tilted white frame; stripes when there's no photo yet. */
export function Polaroid({
  seed,
  photoUrl,
  alt = '',
  size = 'sm',
  caption,
  className,
}: PolaroidProps) {
  return (
    <div
      className={cn('flex-none bg-photo-frame p-1 shadow-photo', className)}
      style={{ rotate: `${tilt(seed, 4)}deg` }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={alt} className={cn('object-cover', SIZES[size])} />
      ) : (
        <div className={cn('photo-empty', SIZES[size])} />
      )}
      {caption && size !== 'sm' && (
        <p className="truncate pt-0.5 text-center type-hand text-photo-caption">{caption}</p>
      )}
    </div>
  )
}
