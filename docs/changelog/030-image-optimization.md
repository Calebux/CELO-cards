# Image Optimization Pass

Character portraits and arena backgrounds are served as WebP to cut bandwidth.
Next.js Image component is used throughout with explicit width/height to prevent CLS.
Large assets above 100 KB have been compressed without visible quality loss.
