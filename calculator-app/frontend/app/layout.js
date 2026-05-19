import './globals.css'

export const metadata = {
  title: 'Calculator App',
  description: 'A beautiful calculator built with Next.js and Node.js',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
