import unittest


class PackageTest(unittest.TestCase):
    def test_package_imports(self) -> None:
        import model

        self.assertIsNotNone(model)
