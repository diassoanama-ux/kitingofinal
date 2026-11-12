import * as React from 'react'

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean
  priority?: boolean
  unoptimized?: boolean
}

export default function Image({
  fill,
  className = '',
  alt = '',
  priority: _priority,
  unoptimized: _unoptimized,
  ...props
}: ImageProps) {
  const fillClasses = fill ? 'absolute inset-0 h-full w-full' : ''
  return <img alt={alt} className={`${fillClasses} ${className}`.trim()} {...props} />
}
