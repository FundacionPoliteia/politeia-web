import SoftParallaxBackdrop from './SoftParallaxBackdrop';

export default function CardMotionBackdrop({ seed, variant = 'project' }) {
  return <SoftParallaxBackdrop seed={seed} variant={variant} />;
}
