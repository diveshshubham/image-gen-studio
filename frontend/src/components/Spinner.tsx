import React from 'react';
import { motion } from 'framer-motion';

export default function Spinner() {
  return (
    <motion.div
      className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mx-auto my-2"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
    />
  );
}
