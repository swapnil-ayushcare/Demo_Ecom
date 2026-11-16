'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { ProductImage } from '@/server/catalogue/types';
import styles from './ProductGallery.module.css';

export interface ProductGalleryProps {
  images: ProductImage[];
  name: string;
}

export function ProductGallery({ images, name }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = images[selectedIndex] ?? images[0];

  if (!selected) {
    return (
      <div className={styles.gallery} data-testid="product-gallery">
        <div className={[styles.stage, styles.emptyStage].join(' ')}>
          <ImageOff aria-hidden="true" size={38} strokeWidth={1.2} />
          <p>No photograph yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.gallery} data-testid="product-gallery">
      <div className={styles.stage}>
        <img
          className={styles.mainImage}
          src={selected.url}
          alt={selected.alt || name}
          width={900}
          height={900}
          data-testid="product-main-image"
        />
      </div>

      {images.length > 1 ? (
        <ul className={styles.thumbnails} aria-label="Product images">
          {images.map((image, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  className={[styles.thumbnail, isSelected ? styles.thumbnailSelected : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`Show image ${index + 1} of ${images.length}: ${
                    image.alt || name
                  }`}
                  aria-pressed={isSelected}
                  data-selected={isSelected ? 'true' : 'false'}
                  onClick={() => setSelectedIndex(index)}
                >
                  <img src={image.url} alt="" width={160} height={160} loading="lazy" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className={styles.caption}>
        {images.length === 1
          ? 'One photograph from the shelf.'
          : `${images.length} photographs from the shelf. Choose one to look closer.`}
      </p>
    </div>
  );
}
