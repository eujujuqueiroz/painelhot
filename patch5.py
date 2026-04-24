import os
path = 'c:/Users/samue/Downloads/Privacy Painel/Privacy ｜ Checkout eujujuqueiroz.html'
text = open(path, encoding='utf-8').read()

old_script = '''<script>
  document.addEventListener("DOMContentLoaded", function() {
    const tabs = document.querySelectorAll(".nav-tabs .nav-link");
    tabs.forEach(tab => {
      tab.addEventListener("click", function(e) {
        e.preventDefault(); // Prevent jump to #posts or #medias
        // Remove active class from all tabs
        tabs.forEach(t => t.classList.remove("active"));
        // Add active class to clicked tab
        this.classList.add("active");
        
        // If there were actual containers, we would toggle them here.
        // For now, we just update the visual state.
      });
    });
  });
</script>'''

new_script = '''<script>
  // Tab toggle logic with event delegation
  document.body.addEventListener('click', function(e) {
    const tab = e.target.closest('.nav-tabs .nav-link');
    if (tab) {
      e.preventDefault();
      document.querySelectorAll('.nav-tabs .nav-link').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    }
  });
</script>'''

if old_script in text:
    text = text.replace(old_script, new_script)
    open(path, 'w', encoding='utf-8').write(text)
    print("Replaced script successfully.")
else:
    # Just append new script if old not found
    open(path, 'a', encoding='utf-8').write('\n' + new_script)
    print("Appended new script.")
