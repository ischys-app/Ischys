import React from 'react';
import { upperDisplay } from '../i18n/upper';

/** Uppercase the string children of a Text (accent-free Greek); elements pass through. */
export function upperChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (c) => (typeof c === 'string' ? upperDisplay(c) : c));
}
