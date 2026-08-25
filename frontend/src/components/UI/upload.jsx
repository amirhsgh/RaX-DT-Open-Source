import * as React from "react"
import { cn } from "../../utils/cn"

const Upload = React.forwardRef(({ className, children, onChange, accept, multiple, beforeUpload, showUploadList, fileList, onRemove, maxCount, ...props }, ref) => {
  const inputRef = React.useRef(null)
  const [internalFileList, setInternalFileList] = React.useState([])

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (e) => {
    const files = Array.from(e.target.files || [])

    files.forEach(file => {
      // If beforeUpload is provided, call it
      if (beforeUpload) {
        const result = beforeUpload(file)
        // If beforeUpload returns false, don't proceed
        if (result === false) {
          return
        }
      }

      // Update internal file list
      if (maxCount === 1) {
        setInternalFileList([file])
      } else {
        setInternalFileList(prev => [...prev, file])
      }
    })

    if (onChange) {
      onChange({ fileList: files, file: files[0] })
    }

    // Reset input value to allow selecting the same file again
    e.target.value = ''
  }

  const displayFileList = fileList !== undefined ? fileList : internalFileList

  return (
    <div className={cn("w-full", className)} {...props}>
      <div className="cursor-pointer w-full" onClick={handleClick}>
        {children}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
      />
      {showUploadList !== false && displayFileList.length > 0 && (
        <div className="mt-2 space-y-2">
          {displayFileList.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 border rounded">
              <span className="text-sm truncate">{file.name}</span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(file)}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
Upload.displayName = "Upload"

const UploadDragger = React.forwardRef(({ className, children, onChange, accept, multiple, beforeUpload, showUploadList, fileList, onRemove, maxCount, ...props }, ref) => {
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef(null)
  const [internalFileList, setInternalFileList] = React.useState([])

  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const processFiles = (files) => {
    files.forEach(file => {
      // If beforeUpload is provided, call it
      if (beforeUpload) {
        const result = beforeUpload(file)
        // If beforeUpload returns false, don't proceed
        if (result === false) {
          return
        }
      }

      // Update internal file list
      if (maxCount === 1) {
        setInternalFileList([file])
      } else {
        setInternalFileList(prev => [...prev, file])
      }
    })

    if (onChange && files.length > 0) {
      onChange({ fileList: files, file: files[0] })
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files || [])
    processFiles(files)
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (e) => {
    const files = Array.from(e.target.files || [])
    processFiles(files)
    // Reset input value
    e.target.value = ''
  }

  const displayFileList = fileList !== undefined ? fileList : internalFileList

  return (
    <div
      ref={ref}
      className={cn(
        "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      {...props}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
      />
      {children}
      {showUploadList !== false && displayFileList.length > 0 && (
        <div className="mt-4 space-y-2">
          {displayFileList.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 border rounded bg-primary">
              <span className="text-sm truncate">{file.name}</span>
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(file)
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
UploadDragger.displayName = "UploadDragger"

Upload.Dragger = UploadDragger

export { Upload, UploadDragger }
