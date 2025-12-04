# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import threading
import time
import socket
import logging
import requests
import sys

from server import create_app
import server
import server.lib.util as libutil
import server.lib.topic_cache as topic_cache
import server.lib.nl.common.bad_words as bad_words
# We import these modules to patch them. Use try-except to avoid issues if not installed/configured in test env
try:
    import server.routes.shared_api.autocomplete.stat_vars as stat_vars
    import server.lib.vertex_ai as vertex_ai
    from google.cloud import language_v1
except ImportError:
    logging.warning("Could not import modules for patching GCP services. Autocomplete tests might fail.")
    stat_vars = None
    vertex_ai = None
    language_v1 = None

from server.webdriver.base import WebdriverBaseTest

# Module-level variables to share the server instance across tests in the same process (worker)
_server_thread = None
_server_port = None

class InProcessWebdriverBase(WebdriverBaseTest):
    """Base test class that runs the server in-process."""

    @classmethod
    def setUpClass(cls):
        global _server_thread, _server_port

        # Ensure environment is set correctly
        if os.environ.get('FLASK_ENV') != 'webdriver':
             logging.warning(f"FLASK_ENV is {os.environ.get('FLASK_ENV')}, expected 'webdriver'.")

        if _server_thread is None:
            # Patch GCP dependencies to avoid credential errors in sandbox
            cls._patch_gcp_dependencies()

            # Find a free port
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('localhost', 0))
                _server_port = s.getsockname()[1]

            # Create and start the app
            try:
                app = create_app()
            except Exception as e:
                import traceback
                logging.error(f"Error creating app: {e}")
                traceback.print_exc()
                raise e

            def run_app():
                # threaded=True is default in Flask 1.0+
                # use_reloader=False is critical for threads
                app.run(port=_server_port, use_reloader=False, threaded=True)

            _server_thread = threading.Thread(target=run_app, daemon=True)
            _server_thread.start()

            # Wait for server to start
            cls.wait_for_server(_server_port)

        cls.port = _server_port
        # Set env var for conftest.py to read
        os.environ['WEBSITE_PORT'] = str(cls.port)

        # Now call super, which calls check_backend_ready
        super().setUpClass()

    @classmethod
    def get_class_server_url(cls):
        # Override to return the dynamic port
        if hasattr(cls, 'port') and cls.port:
            return f'http://localhost:{cls.port}'
        # Fallback if port not set yet (should not happen if setUpClass called)
        # But global _server_port might be available
        global _server_port
        if _server_port:
             return f'http://localhost:{_server_port}'
        return super().get_class_server_url()

    @staticmethod
    def wait_for_server(port):
        url = f"http://localhost:{port}/health"
        # Wait up to 20 seconds
        retries = 40
        while retries > 0:
            try:
                response = requests.get(url)
                if response.status_code == 200:
                    return
            except requests.ConnectionError:
                pass
            time.sleep(0.5)
            retries -= 1
        raise RuntimeError(f"Server failed to start on port {port} in thread.")

    @classmethod
    def _patch_gcp_dependencies(cls):
        """Patches GCP dependencies that require credentials."""
        # Patch load_redirects to avoid storage.Client()
        libutil.load_redirects = lambda: {}

        # Patch _get_api_key in server module to avoid SecretManager
        if hasattr(server, '_get_api_key'):
             server._get_api_key = lambda env_keys=[], gcp_project='', gcp_path='': 'mock_key'

        # Patch secretmanager just in case
        if hasattr(server, 'secretmanager'):
             class MockSecretManager:
                 def SecretManagerServiceClient(self):
                     raise RuntimeError("SecretManagerServiceClient called despite patching!")
             server.secretmanager = MockSecretManager()

        # Patch google.cloud.storage in libutil just in case
        if hasattr(libutil, 'storage'):
             class MockStorage:
                 def Client(self):
                     raise RuntimeError("storage.Client called despite patching!")
             libutil.storage = MockStorage()

        # Patch topic_cache.load to avoid storage.Client()
        topic_cache.load = lambda x: {}

        # Patch bad_words.load_bad_words to avoid storage.Client()
        bad_words.load_bad_words = lambda: {}

        # Patch load_bad_words in server module (since it was imported with from ... import)
        if hasattr(server, 'load_bad_words'):
             server.load_bad_words = lambda: {}

        # Patch autocomplete stat_vars
        if stat_vars:
            stat_vars._get_language_client = lambda: MockLanguageClient()

        # Patch vertex_ai
        if vertex_ai:
            vertex_ai.search = lambda **kwargs: MockVertexAIResponse()

class MockLanguageClient:
    def analyze_syntax(self, document, encoding_type):
        # Minimal syntax response
        return type('Response', (), {'tokens': []})()

    def analyze_entities(self, document, encoding_type):
        # If language_v1 is available, return mock entities
        entities = []
        if language_v1:
            # Create a mock Entity for "California"
            # We use simple classes/objects to mimic protobuf messages
            class MockEntity:
                name = "California"
                type_ = language_v1.Entity.Type.LOCATION

            # Only return if query looks like place search
            content = document.content
            if 'California' in content or 'Calif' in content:
                entities.append(MockEntity())

        return type('Response', (), {'entities': entities})()

class MockVertexAIResponse:
    def __init__(self):
         self.results = []
         # Create dummy results that satisfy ScoredPrediction extraction
         # result.document.struct_data.get("dcid")
         for i in range(6):
             class MockDoc:
                 struct_data = {'dcid': f'dcid_{i}', 'name': f'GDP {i}'}
             class MockResult:
                 document = MockDoc()
             self.results.append(MockResult())
