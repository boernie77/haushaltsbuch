import React from 'react';

export default function ImpressumPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Impressum</h1>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Angaben gemäß § 5 TMG</h2>
        <p className="text-gray-700 dark:text-gray-300">
          Christian Bernauer<br />
          Dianastr. 2b<br />
          90547 Stein
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Kontakt</h2>
        <p className="text-gray-700 dark:text-gray-300">
          E-Mail: <a href="mailto:christian@bernauer24.com" className="text-[var(--primary)] hover:underline">christian@bernauer24.com</a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p className="text-gray-700 dark:text-gray-300">
          Christian Bernauer<br />
          Dianastr. 2b<br />
          90547 Stein
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Verwendete Open-Source-Lizenzen</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-3">
          Diese Anwendung verwendet Open-Source-Software. Alle eingesetzten Pakete stehen unter
          permissiven Lizenzen (MIT, Apache 2.0, ISC), die eine kommerzielle Nutzung ausdrücklich erlauben.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-700 dark:text-gray-300 border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 font-semibold">Paket</th>
                <th className="text-left py-2 font-semibold">Lizenz</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['React, React Native', 'MIT'],
                ['Expo', 'MIT'],
                ['Express', 'MIT'],
                ['Sequelize', 'MIT'],
                ['React Native Paper', 'MIT'],
                ['Tailwind CSS', 'MIT'],
                ['Recharts', 'MIT'],
                ['Anthropic SDK (@anthropic-ai/sdk)', 'MIT'],
                ['react-native-mmkv', 'MIT'],
                ['@expo/vector-icons, react-native-vector-icons', 'MIT'],
                ['axios, date-fns, zustand, zod', 'MIT'],
                ['bcryptjs, jsonwebtoken, node-cron, multer', 'MIT'],
                ['lucide-react', 'ISC'],
                ['Sharp', 'Apache 2.0'],
                ['ssh2-sftp-client', 'Apache 2.0'],
              ].map(([pkg, lic]) => (
                <tr key={pkg} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-4">{pkg}</td>
                  <td className="py-2">{lic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
