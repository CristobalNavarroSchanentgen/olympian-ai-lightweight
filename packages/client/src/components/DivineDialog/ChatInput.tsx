import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, X, Image as ImageIcon } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from '@/hooks/useToast';

interface ChatInputProps {
  onSendMessage: (content: string, images?: string[]) => void;
  onCancel: () => void;
  isDisabled: boolean;
  isGenerating: boolean;
}

export function ChatInput({ onSendMessage, onCancel, isDisabled, isGenerating }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onDrop = (acceptedFiles: File[]) => {
    const imageFiles = acceptedFiles.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== acceptedFiles.length) {
      toast({
        title: 'Warning',
        description: 'Only image files are supported',
        variant: 'destructive',
      });
    }

    const newImages = imageFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setImages(prev => [...prev, ...newImages]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    noClick: true,
  });

  const handleSend = async () => {
    if (!message.trim() && images.length === 0) return;

    // Convert images to base64
    const base64Images = await Promise.all(
      images.map(async ({ file }) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64.split(',')[1]); // Remove data:image/...;base64, prefix
          };
          reader.readAsDataURL(file);
        });
      })
    );

    onSendMessage(message, base64Images.length > 0 ? base64Images : undefined);
    setMessage('');
    setImages([]);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  return (
    <div className="space-y-2">
      {/* Image Previews */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, index) => (
            <div key={index} className="relative group">
              <img
                src={img.preview}
                alt={`Upload ${index + 1}`}
                className="h-20 w-20 object-cover rounded-lg border"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div {...getRootProps()} className="relative">
        <input {...getInputProps()} />
        
        {isDragActive && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
            <p className="text-primary font-medium">Drop images here...</p>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="resize-none pr-10"
              rows={3}
              disabled={isDisabled}
            />
            <label className="absolute bottom-2 right-2">
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  onDrop(files);
                }}
                disabled={isDisabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isDisabled}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </label>
          </div>
          
          {isGenerating ? (
            <Button
              onClick={onCancel}
              variant="destructive"
              className="self-end"
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={isDisabled || (!message.trim() && images.length === 0)}
              className="self-end"
            >
              <Send className="mr-2 h-4 w-4" />
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}