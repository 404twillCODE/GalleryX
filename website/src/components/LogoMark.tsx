import clsx from 'clsx'

export function LogoMark({ size = 28, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <img
      src="/icon.png"
      alt="GalleryX"
      width={size}
      height={size}
      className={clsx('rounded-[22%] flex-shrink-0 object-cover', className)}
      draggable={false}
    />
  )
}
