import os

filepath = r"c:\Users\J\Documents\PROJECTS\hiremindxBACkup\src\app\community\page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    # Location Search fix
    if "placeholder=\"Location (e.g. Remote, City)\"" in line:
        indent = line[:line.find("<Input")]
        new_lines.append(indent + "<Input\n")
        new_lines.append(indent + "  placeholder=\"Location (e.g. Remote, city)\"\n")
        new_lines.append(indent + "  value={freelancerLocationFilter}\n")
        new_lines.append(indent + "  onChange={(e) => {\n")
        new_lines.append(indent + "    const val = e.target.value;\n")
        new_lines.append(indent + "    setFreelancerLocationFilter(val);\n")
        new_lines.append(indent + "    if (val.length > 1) {\n")
        new_lines.append(indent + "      const popular = [\"Remote\", \"London, UK\", \"New York, USA\", \"San Francisco, USA\", \"Berlin, Germany\", \"Tokyo, Japan\", \"Dubai, UAE\", \"Toronto, Canada\", \"Singapore\", \"Sydney, Australia\"];\n")
        new_lines.append(indent + "      const filtered = popular.filter(loc => loc.toLowerCase().includes(val.toLowerCase())).map(loc => ({ type: 'location', label: loc, value: loc }));\n")
        new_lines.append(indent + "      setSuggestions(filtered);\n")
        new_lines.append(indent + "      setShowSuggestions(filtered.length > 0);\n")
        new_lines.append(indent + "    } else {\n")
        new_lines.append(indent + "      setShowSuggestions(false);\n")
        new_lines.append(indent + "    }\n")
        new_lines.append(indent + "  }}\n")
        new_lines.append(indent + "  className=\"pl-9 h-10 bg-white/[0.03] border border-white/[0.06] text-xs focus:ring-white/10\"\n")
        new_lines.append(indent + "/>\n")
        new_lines.append(indent + "<AnimatePresence>\n")
        new_lines.append(indent + "  {showSuggestions && (\n")
        new_lines.append(indent + "    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className=\"absolute left-0 right-0 top-12 z-[100] bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden p-1\">\n")
        new_lines.append(indent + "      {suggestions.map((s, idx) => (\n")
        new_lines.append(indent + "        <button key={idx} onClick={() => { setFreelancerLocationFilter(s.value); setShowSuggestions(false); }} className=\"w-full text-left px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-all\">\n")
        new_lines.append(indent + "          <Search className=\"w-3 h-3 text-white/30\" /> {s.label}\n")
        new_lines.append(indent + "        </button>\n")
        new_lines.append(indent + "      ))}\n")
        new_lines.append(indent + "    </motion.div>\n")
        new_lines.append(indent + "  )}\n")
        new_lines.append(indent + "</AnimatePresence>\n")
        continue

    # Card click fix and Profile image fix
    if "key={p.id}" in line and "filteredProjects.map" in lines[i-1]:
        new_lines.append(line.replace("onClick={() => {", "onClick={() => { setSelectedDetailsProject(p); setShowProjectDetailsModal(true); "))
        continue 
    
    if "setProfileViewerData({ userId: p.userId || 'client1'" in line:
        new_lines.append(line.replace("setProfileViewerData({ userId: p.userId || 'client1', name: p.authorName || 'Client' });", "setProfileViewerData({ ...p, id: p.userId, name: p.authorName || 'Client', image: p.clientImage });"))
        continue

    # Profile Avatar fix
    if "rounded-[2rem] bg-gradient-to-br from-[#f5c518]/20 to-[#c8960c]/5" in line:
        indent = line[:line.find("<div")]
        new_lines.append(indent + "<Avatar className=\"w-24 h-24 rounded-[2rem] border border-[#f5c518]/20 shadow-2xl shrink-0 overflow-hidden\">\n")
        new_lines.append(indent + "  <AvatarImage src={profileViewerData.image || \"\"} className=\"object-cover\" />\n")
        new_lines.append(indent + "  <AvatarFallback className=\"w-full h-full bg-gradient-to-br from-[#f5c518]/20 to-[#c8960c]/5 flex items-center justify-center text-4xl font-black text-[#f5c518]\">\n")
        new_lines.append(indent + "    {profileViewerData.name?.[0] || 'U'}\n")
        new_lines.append(indent + "  </AvatarFallback>\n")
        new_lines.append(indent + "</Avatar>\n")
        # Skip the next line as it was the text content of the old div
        continue 
    if "{profileViewerData.name?.[0] || 'U'}" in line and i > 0 and "rounded-[2rem]" in lines[i-1]:
        continue
    if "</div>" in line and i > 1 and "rounded-[2rem]" in lines[i-2]:
        continue

    new_lines.append(line)

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Fixes applied successfully via backup script")
